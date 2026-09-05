import { z } from "zod";
import { setlistCreateSchema, setlistPatchSchema } from "./schemas/operations";

/** Browser-memory edit state only: no persistence, automatic merge, or writes. */
export type SetlistDraftItem = {
  songId: string | null;
  itemType: "song" | "break" | "note";
  label: string;
  transitionNotes: string;
};
export type SetlistDraftValues = {
  name: string;
  status: "draft" | "active" | "archived";
  notes: string;
  items: SetlistDraftItem[];
};
export type SetlistDraftSnapshot = SetlistDraftValues & { id: string; updatedAt: string };
export type SetlistDraftIssue = "version-missing" | "read-failed" | "invalid-receipt" | "save-conflict" | "save-unconfirmed" | null;
export type SetlistDraftSaveAttempt = {
  requestId: number;
  revision: number;
  baseUpdatedAt: string;
  draft: SetlistDraftValues;
};
export type SetlistDraftState = {
  recordId: string;
  base: SetlistDraftSnapshot | null;
  draft: SetlistDraftValues;
  latest: SetlistDraftSnapshot | null;
  revision: number;
  lastRequestId: number;
  pending: SetlistDraftSaveAttempt | null;
  issue: SetlistDraftIssue;
};
export type SetlistDraftAction =
  | { type: "edit"; draft: SetlistDraftValues }
  | { type: "received"; snapshot: unknown }
  | { type: "read-failed" }
  | { type: "review"; expectedUpdatedAt: string; choice: "use-latest" | "keep-draft" }
  | { type: "begin-save"; requestId: number }
  | { type: "save-succeeded"; requestId: number; snapshot: unknown }
  | { type: "save-failed"; requestId: number; conflict?: boolean };

const timestampSchema = z.string().datetime({ offset: true });
const editableSchema = z.object({
  name: z.string().max(240),
  status: z.enum(["draft", "active", "archived"]),
  notes: z.string().max(2000),
  items: z.array(z.object({
    songId: z.string().nullable(),
    itemType: z.enum(["song", "break", "note"]),
    label: z.string().max(240),
    transitionNotes: z.string().max(1000)
  }).strict()).max(100)
}).strict();

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function copy(draft: SetlistDraftValues): SetlistDraftValues {
  return { name: draft.name, status: draft.status, notes: draft.notes, items: draft.items.map((item) => ({ ...item })) };
}

function canonical(draft: SetlistDraftValues): SetlistDraftValues {
  return {
    name: draft.name.trim(), status: draft.status, notes: draft.notes.trim(),
    items: draft.items.map((item) => ({
      songId: item.songId?.trim() || null, itemType: item.itemType,
      label: item.label.trim(), transitionNotes: item.transitionNotes.trim()
    }))
  };
}

function equal(left: SetlistDraftValues, right: SetlistDraftValues): boolean {
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}

function readValues(value: unknown, recordId: string): SetlistDraftValues | null {
  const row = object(value);
  if (!row || row.id !== recordId || !Array.isArray(row.items) || row.items.length > 100) return null;
  const items = row.items.map((value) => {
    const item = object(value);
    if (!item || !["song", "break", "note"].includes(String(item.itemType))) return null;
    const song = object(item.song);
    return {
      songId: item.songId ?? song?.id ?? null, itemType: item.itemType,
      label: item.label ?? null, transitionNotes: item.transitionNotes ?? null
    };
  });
  const parsed = setlistCreateSchema.safeParse({ name: row.name, status: row.status, notes: row.notes ?? null, items });
  if (!parsed.success || typeof row.status !== "string") return null;
  return {
    name: parsed.data.name, status: parsed.data.status, notes: parsed.data.notes ?? "",
    items: parsed.data.items.map((item) => ({
      songId: item.songId ?? null, itemType: item.itemType,
      label: item.label ?? "", transitionNotes: item.transitionNotes ?? ""
    }))
  };
}

function readSnapshot(value: unknown, recordId: string): SetlistDraftSnapshot | null {
  const row = object(value);
  const values = readValues(value, recordId);
  const timestamp = timestampSchema.safeParse(row?.updatedAt);
  if (!values || !timestamp.success) return null;
  return { ...values, id: recordId, updatedAt: new Date(timestamp.data).toISOString() };
}

function newer(left: SetlistDraftSnapshot, right: SetlistDraftSnapshot): boolean {
  return Date.parse(left.updatedAt) > Date.parse(right.updatedAt);
}

export function createSetlistDraftState(recordId: string, initial: unknown): SetlistDraftState {
  if (!recordId.trim()) throw new Error("A setlist identity is required");
  const base = readSnapshot(initial, recordId);
  const draft = base ? copy(base) : readValues(initial, recordId) ?? { name: "", status: "draft", notes: "", items: [] };
  return { recordId, base, draft, latest: null, revision: 0, lastRequestId: 0, pending: null, issue: base ? null : "version-missing" };
}

export function setlistDraftStatus(state: SetlistDraftState) {
  const dirty = state.base ? !equal(state.draft, state.base) : state.revision > 0;
  const needsReview = state.latest !== null;
  const valid = setlistCreateSchema.safeParse(payloadValues(state.draft)).success;
  return {
    dirty, needsReview, saving: state.pending !== null, issue: state.issue,
    canSave: Boolean(state.base && dirty && valid && !needsReview && !state.pending && !state.issue)
  };
}

function payloadValues(draft: SetlistDraftValues) {
  const values = canonical(draft);
  return {
    ...values, notes: values.notes || null,
    items: values.items.map((item) => ({ ...item, label: item.label || null, transitionNotes: item.transitionNotes || null }))
  };
}

/** Only the reviewed base supplies expectedUpdatedAt; new props cannot advance it. */
export function setlistDraftSavePayload(state: SetlistDraftState): z.infer<typeof setlistPatchSchema> | null {
  if (!setlistDraftStatus(state).canSave || !state.base) return null;
  const parsed = setlistPatchSchema.safeParse({ expectedUpdatedAt: state.base.updatedAt, ...payloadValues(state.draft) });
  return parsed.success ? parsed.data : null;
}

export function reduceSetlistDraft(state: SetlistDraftState, action: SetlistDraftAction): SetlistDraftState {
  if (action.type === "edit") {
    const parsed = editableSchema.safeParse(action.draft);
    return parsed.success ? { ...state, draft: copy(parsed.data), revision: state.revision + 1 } : state;
  }
  if (action.type === "read-failed") return { ...state, issue: "read-failed" };
  if (action.type === "begin-save") {
    if (!Number.isSafeInteger(action.requestId) || action.requestId <= state.lastRequestId || !setlistDraftStatus(state).canSave || !state.base) return state;
    return { ...state, lastRequestId: action.requestId, pending: { requestId: action.requestId, revision: state.revision, baseUpdatedAt: state.base.updatedAt, draft: canonical(state.draft) } };
  }
  if (action.type === "save-failed") {
    if (state.pending?.requestId !== action.requestId) return state;
    return { ...state, pending: null, issue: action.conflict ? "save-conflict" : "save-unconfirmed" };
  }
  if (action.type === "review") {
    if (state.pending || state.issue || !state.latest || action.expectedUpdatedAt !== state.latest.updatedAt) return state;
    return {
      ...state, base: state.latest, latest: null,
      draft: action.choice === "use-latest" ? copy(state.latest) : state.draft,
      revision: state.revision + 1, issue: null
    };
  }
  const snapshot = readSnapshot(action.snapshot, state.recordId);
  if (action.type === "save-succeeded") {
    const pending = state.pending;
    if (!pending || pending.requestId !== action.requestId) return state;
    if (!snapshot || Date.parse(snapshot.updatedAt) <= Date.parse(pending.baseUpdatedAt) || !equal(snapshot, pending.draft)) {
      return { ...state, pending: null, issue: "save-unconfirmed" };
    }
    const known = state.latest ?? state.base;
    if (known?.updatedAt === snapshot.updatedAt && !equal(known, snapshot)) return { ...state, pending: null, issue: "save-unconfirmed" };
    // A read may already have observed another person's subsequent write.
    // Keep that newer candidate for review, even when our own save succeeded.
    const latest = state.latest && newer(state.latest, snapshot) ? state.latest : null;
    if (state.base && newer(state.base, snapshot)) return { ...state, pending: null, issue: "save-unconfirmed" };
    return {
      ...state, base: snapshot, latest, pending: null, issue: null,
      draft: state.revision === pending.revision ? copy(snapshot) : state.draft
    };
  }
  if (!snapshot) return { ...state, issue: "invalid-receipt" };
  const known = state.latest ?? state.base;
  if (known && newer(known, snapshot)) return state;
  if (known && known.updatedAt === snapshot.updatedAt && !equal(known, snapshot)) return { ...state, issue: "invalid-receipt" };
  if (!state.pending && !setlistDraftStatus(state).dirty) {
    return { ...state, base: snapshot, draft: copy(snapshot), latest: null, issue: null };
  }
  if (state.base?.updatedAt === snapshot.updatedAt) return { ...state, issue: null };
  return { ...state, latest: snapshot, issue: null };
}
