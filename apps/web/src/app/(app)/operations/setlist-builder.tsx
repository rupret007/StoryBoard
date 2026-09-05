"use client";

import { Badge } from "@storyboard/ui";
import {
  catalogSourceLabel,
  createSetlistDraftState,
  reduceSetlistDraft,
  setlistDraftSavePayload,
  setlistDraftStatus,
  summarizeSetlist,
  type OpsWorkspaceFocus,
  type OpsWorkspaceTab,
  type SetlistDraftItem,
  type SetlistDraftValues,
} from "@storyboard/shared";
import { ArrowDown, ArrowUp, Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import { useEffect, useReducer, useRef, useState } from "react";
import { ApiHttpError, apiFetch } from "@/lib/api";
import type { BandEvent, Setlist, Song } from "@/lib/types";

type SetlistBuilderProps = {
  setlist: Setlist;
  songs: Song[];
  attachedEvents: BandEvent[];
  artistId: string | null;
  canManage: boolean;
  busy: boolean;
  create: (path: string, json: unknown, method?: string, signal?: AbortSignal) => Promise<unknown>;
  openWorkspace: (tab: OpsWorkspaceTab, eventId?: string, focus?: OpsWorkspaceFocus) => void;
};

function formatSongDuration(seconds: number | null | undefined) {
  if (!seconds) return "";
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

const REQUEST_DEADLINE_MS = 15_000;

/** Bound the whole operation, including response-body reads, not just headers. */
async function completeBeforeAbort<T>(signal: AbortSignal, request: () => Promise<T>): Promise<T> {
  if (signal.aborted) throw new Error("Request interrupted");
  let interrupted: (() => void) | undefined;
  const abort = new Promise<never>((_resolve, reject) => {
    interrupted = () => reject(new Error("Request interrupted"));
    signal.addEventListener("abort", interrupted, { once: true });
  });
  try {
    // Promise.race observes a late rejection too. An abort is uncertain delivery,
    // never permission to resend or a claim that the server did not commit.
    return await Promise.race([request(), abort]);
  } finally {
    if (interrupted) signal.removeEventListener("abort", interrupted);
  }
}

/** The parent keys this editor by band + setlist id, never by updatedAt. */
export function SetlistBuilder({
  setlist,
  songs,
  attachedEvents,
  artistId,
  canManage,
  busy,
  create,
  openWorkspace,
}: SetlistBuilderProps) {
  const [state, dispatch] = useReducer(
    reduceSetlistDraft,
    setlist,
    (initial) => createSetlistDraftState(initial.id, initial),
  );
  const [songToAdd, setSongToAdd] = useState(songs.find((song) => song.active)?.id ?? "");
  const [readingLatest, setReadingLatest] = useState(false);
  const [reviewNote, setReviewNote] = useState("");
  const operation = useRef(false);
  const requestId = useRef(0);
  const mounted = useRef(true);
  const requestController = useRef<AbortController | null>(null);
  const requestDeadline = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      requestController.current?.abort();
      if (requestDeadline.current !== null) clearTimeout(requestDeadline.current);
      requestDeadline.current = null;
    };
  }, []);

  useEffect(() => {
    dispatch({ type: "received", snapshot: setlist });
  }, [setlist]);

  const draftStatus = setlistDraftStatus(state);
  const { draft } = state;
  const { name, status, notes, items } = draft;
  const controlsDisabled = busy || draftStatus.saving || readingLatest || !canManage || !artistId;
  const summary = summarizeSetlist(items.map((item, index) => ({
    id: `${index}`,
    itemType: item.itemType,
    label: item.label,
    song: item.songId ? songs.find((song) => song.id === item.songId) ?? null : null,
  })));

  function edit(patch: Partial<SetlistDraftValues>) {
    if (controlsDisabled || operation.current) return;
    setReviewNote("");
    dispatch({ type: "edit", draft: { ...draft, ...patch } });
  }

  function updateItem(index: number, patch: Partial<SetlistDraftItem>) {
    edit({ items: items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item) });
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target]!, next[index]!];
    edit({ items: next });
  }

  function addSong() {
    if (!songToAdd || items.length >= 100 || !songs.some((song) => song.id === songToAdd)) return;
    edit({ items: [...items, { songId: songToAdd, itemType: "song", label: "", transitionNotes: "" }] });
  }

  function addMarker(itemType: "break" | "note") {
    if (items.length >= 100) return;
    edit({ items: [...items, {
      songId: null,
      itemType,
      label: itemType === "break" ? "Set break" : "Talk / announcement",
      transitionNotes: "",
    }] });
  }

  function beginDeadline() {
    const controller = new AbortController();
    requestController.current = controller;
    requestDeadline.current = setTimeout(() => controller.abort(), REQUEST_DEADLINE_MS);
    return controller;
  }

  function finishDeadline(controller: AbortController) {
    if (requestController.current !== controller) return;
    if (requestDeadline.current !== null) clearTimeout(requestDeadline.current);
    requestDeadline.current = null;
    requestController.current = null;
  }

  async function save() {
    const payload = setlistDraftSavePayload(state);
    if (controlsDisabled || operation.current || !payload) return;
    operation.current = true;
    const controller = beginDeadline();
    const currentRequest = ++requestId.current;
    setReviewNote("");
    dispatch({ type: "begin-save", requestId: currentRequest });
    try {
      const result = await completeBeforeAbort(controller.signal, () => create(`/setlists/${setlist.id}`, payload, "PATCH", controller.signal));
      if (controller.signal.aborted) throw new Error("Request interrupted");
      if (mounted.current) dispatch({ type: "save-succeeded", requestId: currentRequest, snapshot: result });
    } catch (error) {
      if (mounted.current) {
        dispatch({
          type: "save-failed",
          requestId: currentRequest,
          conflict: error instanceof ApiHttpError && error.status === 409,
        });
      }
    } finally {
      finishDeadline(controller);
      operation.current = false;
    }
  }

  async function reviewLatest() {
    if (controlsDisabled || operation.current || !artistId) return;
    operation.current = true;
    const controller = beginDeadline();
    setReadingLatest(true);
    setReviewNote("");
    try {
      const result = await completeBeforeAbort(controller.signal, () => apiFetch<unknown>("/setlists", {
        artistId,
        cache: "no-store",
        signal: controller.signal,
      }));
      if (controller.signal.aborted) throw new Error("Request interrupted");
      if (!mounted.current) return;
      const matchingRows = Array.isArray(result)
        ? result.filter((row: unknown) => row !== null && typeof row === "object" && "id" in row && row.id === setlist.id)
        : [];
      const latest = matchingRows.length === 1 ? matchingRows[0] : undefined;
      if (!latest) {
        dispatch({ type: "read-failed" });
        setReviewNote("The latest saved running order could not be verified. Your draft is still here. Try Review latest again when access is available.");
        return;
      }
      dispatch({ type: "received", snapshot: latest });
      // A server refresh may have arrived during the read. The actual reducer
      // result, not this handler's older closure, supplies the verified status.
      setReviewNote("");
    } catch {
      if (mounted.current) {
        dispatch({ type: "read-failed" });
        setReviewNote("Could not load the latest saved running order. Your draft is still here. Check the connection or access, then try Review latest again.");
      }
    } finally {
      finishDeadline(controller);
      operation.current = false;
      if (mounted.current) setReadingLatest(false);
    }
  }

  function chooseReviewed(choice: "use-latest" | "keep-draft") {
    if (controlsDisabled || operation.current || !state.latest || state.issue) return;
    dispatch({ type: "review", expectedUpdatedAt: state.latest.updatedAt, choice });
    // The reducer can reject an outdated choice if newer props arrived first.
    // Render its resulting saved/unsaved/review status instead of claiming the
    // requested choice succeeded before its version receipt has been checked.
    setReviewNote("");
  }

  const stateLabel = draftStatus.saving
    ? "Saving running order"
    : draftStatus.issue === "save-conflict"
      ? "Saved version changed — your draft is kept"
      : draftStatus.issue === "read-failed"
        ? "Latest saved version unavailable — your draft is kept"
        : draftStatus.issue === "version-missing" || draftStatus.issue === "invalid-receipt"
          ? "Saved version unverified — your draft is kept"
          : draftStatus.issue
            ? "Save not confirmed — your draft is kept"
            : draftStatus.needsReview
              ? "Review needed — your draft is kept"
              : draftStatus.dirty
                ? "Unsaved running order"
                : "Saved version loaded";

  const stateDetail = draftStatus.saving
    ? "Wait for the saved-version receipt. Editing is paused while this request is in flight."
    : draftStatus.issue === "save-conflict"
      ? "The running order changed since you opened it. Review latest to compare the saved changes with your draft before another save."
      : draftStatus.issue === "save-unconfirmed"
        ? "Do not retry blindly: the earlier request may have reached StoryBoard. Review latest before deciding what to save."
        : draftStatus.issue
          ? "A reliable saved version is required before saving or choosing a draft. Check the connection or access, then try Review latest."
          : draftStatus.needsReview
            ? "A saved version needs your review. Compare it with your draft, then explicitly choose which version to continue with."
            : draftStatus.dirty
              ? "Changes are only in this open editor. Save when ready; switching operations tabs keeps this draft, but closing or reloading the page does not."
              : "This editor matches its saved version. Change the running order below, then save explicitly.";

  return (
    <details className="rounded-xl border border-[var(--border)] p-4" data-testid={`setlist-${setlist.id}`}>
      <summary className="cursor-pointer list-none">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="break-words font-medium">{name || setlist.name}</p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              {summary.durationLabel} · {items.length} item{items.length === 1 ? "" : "s"} · {catalogSourceLabel(setlist.sourceKey)}
            </p>
            {attachedEvents.length ? (
              <p className="mt-1 text-xs text-[var(--text-secondary)]">Attached to {attachedEvents.map((event) => event.title).join(", ")}</p>
            ) : (
              <p className="mt-1 text-xs text-[var(--text-muted)]">Not attached to a show yet. Attach it from Events.</p>
            )}
            {summary.timingStatus === "incomplete" ? (
              <p className="mt-1 text-xs font-medium text-[var(--text-primary)]">Next: record every song duration in the library before relying on this set length.</p>
            ) : null}
            <p className="mt-2 text-xs font-medium text-[var(--text-secondary)]">{stateLabel}</p>
          </div>
          <Badge variant={status === "active" ? "success" : "neutral"}>{status}</Badge>
        </div>
      </summary>

      <div className="mt-5 border-t border-[var(--border)] pt-4">
        <div
          className="mb-4 rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)] p-3"
          data-testid="setlist-draft-status"
          role="status"
          aria-live="polite"
        >
          <p className="text-sm font-semibold">{stateLabel}</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">{stateDetail}</p>
          {!state.base ? (
            <p className="mt-2 text-xs text-amber-200">StoryBoard could not verify which running-order version you opened. Review latest before saving.</p>
          ) : null}
          {reviewNote ? <p className="mt-2 text-xs text-[var(--text-secondary)]">{reviewNote}</p> : null}
          <button
            type="button"
            className="sb-btn-secondary mt-3"
            disabled={controlsDisabled}
            onClick={() => void reviewLatest()}
          >
            <RefreshCw className="h-4 w-4" /> {readingLatest ? "Loading latest…" : "Review latest saved version"}
          </button>
        </div>

        {state.latest ? (
          <section aria-label={`Compare saved running order for ${setlist.name}`} className="mb-5 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4" data-testid="setlist-version-review">
            <h3 className="font-semibold">Compare before continuing</h3>
            <p className="mt-1 text-xs text-[var(--text-muted)]">No automatic merge or resend. Keeping your draft replaces the reviewed running order only after you separately save.</p>
            {state.issue ? <p className="mt-2 text-xs text-amber-200">Review latest again before choosing. The saved version below has not been reverified after the failed check.</p> : null}
            <div className="mt-4 grid min-w-0 gap-4 md:grid-cols-2">
              <DraftComparison title="Your unsaved draft" values={draft} songs={songs} />
              <DraftComparison title="Latest saved version" values={state.latest} songs={songs} />
            </div>
            <p className="mt-4 text-xs text-[var(--text-secondary)]">Use latest saved version discards your entire local draft. Keep my draft preserves it for a separate Save running order; neither choice sends changes.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" className="sb-btn-secondary" disabled={controlsDisabled || Boolean(state.issue)} onClick={() => chooseReviewed("use-latest")}>Use latest saved version</button>
              <button type="button" className="sb-btn-secondary" disabled={controlsDisabled || Boolean(state.issue)} onClick={() => chooseReviewed("keep-draft")}>Keep my draft</button>
            </div>
          </section>
        ) : null}

        <fieldset className="m-0 min-w-0 border-0 p-0" disabled={controlsDisabled}>
          <div className="grid gap-3 sm:grid-cols-2">
            <label>
              <span className="sb-label">Setlist name</span>
              <input aria-label={`Name for setlist ${setlist.name}`} className="sb-input mt-1.5" value={name} maxLength={240} onChange={(event) => edit({ name: event.target.value })} />
            </label>
            <label>
              <span className="sb-label">Status</span>
              <select aria-label={`Status for setlist ${setlist.name}`} className="sb-select mt-1.5" value={status} onChange={(event) => edit({ status: event.target.value as SetlistDraftValues["status"] })}>
                <option value="draft">draft</option>
                <option value="active">active</option>
                <option value="archived">archived</option>
              </select>
            </label>
            <label className="sm:col-span-2">
              <span className="sb-label">Set notes</span>
              <textarea aria-label={`Notes for setlist ${setlist.name}`} className="sb-input mt-1.5 min-h-20" value={notes} maxLength={2000} onChange={(event) => edit({ notes: event.target.value })} placeholder="Show-specific cues, tuning notes, or a backup plan" />
            </label>
          </div>

          <div className="mt-4 rounded-lg bg-[var(--surface-subtle)] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium">{summary.durationLabel}</p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">{summary.songCount} song{summary.songCount === 1 ? "" : "s"} · {summary.breakCount} break{summary.breakCount === 1 ? "" : "s"} · song time excludes breaks</p>
              </div>
              {summary.timingStatus === "incomplete" ? <Badge variant="warning">timing incomplete</Badge> : summary.timingStatus === "timed" ? <Badge variant="success">timed</Badge> : <Badge variant="neutral">empty</Badge>}
            </div>
            {attachedEvents.length === 0 ? <button type="button" className="sb-btn-secondary mt-3" onClick={() => openWorkspace("events")}>Attach this set from Events</button> : null}
          </div>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <select aria-label={`Song to add to ${setlist.name}`} className="sb-select min-w-0 flex-1" value={songToAdd} onChange={(event) => setSongToAdd(event.target.value)}>
              <option value="">Choose a song</option>
              {songs.filter((song) => song.active || items.some((item) => item.songId === song.id)).map((song) => (
                <option key={song.id} value={song.id}>{song.title}{song.durationSeconds ? ` · ${formatSongDuration(song.durationSeconds)}` : " · duration unknown"}</option>
              ))}
            </select>
            <button type="button" className="sb-btn-secondary" disabled={!songToAdd || items.length >= 100} aria-label={`Add song to ${setlist.name}`} onClick={addSong}><Plus className="h-4 w-4" /> Song</button>
            <button type="button" className="sb-btn-secondary" disabled={items.length >= 100} aria-label={`Add break to ${setlist.name}`} onClick={() => addMarker("break")}><Plus className="h-4 w-4" /> Break</button>
            <button type="button" className="sb-btn-secondary" disabled={items.length >= 100} aria-label={`Add note to ${setlist.name}`} onClick={() => addMarker("note")}><Plus className="h-4 w-4" /> Note</button>
          </div>
          <ol className="mt-4 space-y-2">
            {items.map((item, index) => {
              const song = item.songId ? songs.find((candidate) => candidate.id === item.songId) : null;
              return (
                <li key={`${item.itemType}-${index}`} className="rounded-lg border border-[var(--border)] p-3">
                  <div className="flex items-start gap-3">
                    <span className="mt-2 w-6 shrink-0 text-center text-xs font-semibold text-[var(--text-muted)]">{index + 1}</span>
                    <div className="min-w-0 flex-1 space-y-2">
                      {item.itemType === "song" ? (
                        <select aria-label={`Song at position ${index + 1} in ${setlist.name}`} className="sb-select" value={item.songId ?? ""} onChange={(event) => updateItem(index, { songId: event.target.value || null })}>
                          <option value="">Choose a saved song</option>
                          {songs.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.title}{!candidate.active ? " · inactive" : ""}</option>)}
                        </select>
                      ) : (
                        <input aria-label={`${item.itemType === "break" ? "Break" : "Note"} at position ${index + 1} in ${setlist.name}`} className="sb-input" value={item.label} maxLength={240} onChange={(event) => updateItem(index, { label: event.target.value })} />
                      )}
                      <input aria-label={`Transition after position ${index + 1} in ${setlist.name}`} className="sb-input" value={item.transitionNotes} maxLength={1000} onChange={(event) => updateItem(index, { transitionNotes: event.target.value })} placeholder={item.itemType === "song" ? "Transition, tuning, count-in, or segue" : "Optional detail"} />
                      <p className="text-xs text-[var(--text-muted)]">{item.itemType === "song" ? song?.durationSeconds ? `${song.title} · ${formatSongDuration(song.durationSeconds)}` : `${song?.title ?? item.label ?? "Song"} · duration unknown` : item.itemType}</p>
                    </div>
                    <div className="flex shrink-0 flex-col gap-1">
                      <button type="button" className="sb-btn-ghost px-2" aria-label={`Move position ${index + 1} up in ${setlist.name}`} disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp className="h-4 w-4" /></button>
                      <button type="button" className="sb-btn-ghost px-2" aria-label={`Move position ${index + 1} down in ${setlist.name}`} disabled={index === items.length - 1} onClick={() => move(index, 1)}><ArrowDown className="h-4 w-4" /></button>
                      <button type="button" className="sb-btn-ghost px-2 text-red-300" aria-label={`Remove position ${index + 1} from ${setlist.name}`} onClick={() => edit({ items: items.filter((_, itemIndex) => itemIndex !== index) })}><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
          {!items.length ? <p className="mt-4 text-sm text-[var(--text-muted)]">No running order yet. Add a song, break, or note above.</p> : null}
          {draftStatus.dirty && !draftStatus.saving && !draftStatus.issue && !draftStatus.needsReview && !draftStatus.canSave ? <p className="mt-4 text-sm text-amber-200">Add a setlist name and choose each song or give each break or note a label before saving.</p> : null}
          <button type="button" className="sb-btn-primary mt-4" disabled={!draftStatus.canSave} onClick={() => void save()}><Save className="h-4 w-4" /> {draftStatus.saving ? "Saving running order…" : "Save running order"}</button>
        </fieldset>
      </div>
    </details>
  );
}

function DraftComparison({ title, values, songs }: { title: string; values: SetlistDraftValues; songs: Song[] }) {
  return (
    <div className="min-w-0 rounded-lg border border-[var(--border)] bg-[var(--surface-0)] p-3">
      <h4 className="text-sm font-semibold">{title}</h4>
      <dl className="mt-3 space-y-2 text-xs">
        <div><dt className="font-medium text-[var(--text-muted)]">Name</dt><dd className="whitespace-pre-wrap break-words">{values.name || "No name"}</dd></div>
        <div><dt className="font-medium text-[var(--text-muted)]">Status</dt><dd>{values.status}</dd></div>
        <div><dt className="font-medium text-[var(--text-muted)]">Set notes</dt><dd className="whitespace-pre-wrap break-words">{values.notes || "No set notes"}</dd></div>
      </dl>
      <p className="mt-3 text-xs font-medium text-[var(--text-muted)]">Running order · {values.items.length} item{values.items.length === 1 ? "" : "s"}</p>
      {values.items.length ? (
        <ol className="mt-2 space-y-2 text-xs">
          {values.items.map((item, index) => {
            const song = songs.find((candidate) => candidate.id === item.songId);
            return (
              <li key={index} className="break-words border-t border-[var(--border)] pt-2">
                <p>{index + 1}. {item.itemType === "song" ? (song?.title ?? item.label) || "Song unavailable in this library" : `${item.itemType === "break" ? "Break" : "Note"}: ${item.label}`}</p>
                {item.itemType === "song" && item.label ? <p className="mt-1 whitespace-pre-wrap text-[var(--text-muted)]">Label: {item.label}</p> : null}
                <p className="mt-1 whitespace-pre-wrap text-[var(--text-muted)]">{item.transitionNotes ? `Transition / detail: ${item.transitionNotes}` : "No transition note"}</p>
              </li>
            );
          })}
        </ol>
      ) : <p className="mt-2 text-xs text-[var(--text-muted)]">No running order.</p>}
    </div>
  );
}
