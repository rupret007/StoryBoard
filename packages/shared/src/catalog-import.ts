import { z } from "zod";

export const CATALOG_IMPORT_POLICY_VERSION = "catalog_import_v1" as const;
/** Exact or phrase match. Hybrids that phrase-match stay on the current artist. */
export const LIVE_CATALOG_PROJECTS = ["rad dad", "jeff story"] as const;
export const PARKED_CATALOG_PROJECTS = ["stalemate", "trailer swift", "something dirty"] as const;
export const BOOKER_CATALOG_PROJECTS = ["travis", "travis story"] as const;
export const CATALOG_IMPORT_SCOPES = [
  "default_live",
  "parked_catalog",
  "not_live_band",
  "not_setlist_ready",
  "cover_not_active"
] as const;
export const VAULT_SAMPLE_CATALOG_RELATIVE_PATH = "packages/shared/test/fixtures/vault-app-api.sample.json";
export const VAULT_DEFAULT_LIVE_SETLIST_NAME = "Vault default-live";
export const VAULT_SETLIST_READY_SETLIST_NAME = "Vault setlist-ready";
export const VAULT_SPINE_IMPORT_ERROR =
  "master_catalog.json is the Vault spine, not the StoryBoard import feed; export data/app_api.json.";
export const VAULT_FEED_IMPORT_ERROR =
  "Vault import requires the data/app_api.json StoryBoard feed.";

/** Travis is the human booker. StoryBoard never auto-pitches him. */
export const CATALOG_BOOKER_POLICY = "travis_books" as const;

/** Live Vault `storyboard.field_map` honesty (AI-Music-Vault schema 3). */
export const VAULT_STORYBOARD_FIELD_MAP = {
  title: "title",
  musicalKey: "key",
  bpm: "bpm_int",
  sourceKey: `vault:${CATALOG_IMPORT_POLICY_VERSION}:{vault_id ?? id}`,
  notes: "vault_ref",
  active: "is_original !== false"
} as const;

export type CatalogImportScope = (typeof CATALOG_IMPORT_SCOPES)[number];

const RECOGNIZED_IMPORT_SCOPES = new Set<string>([
  ...CATALOG_IMPORT_SCOPES,
  CATALOG_BOOKER_POLICY
]);

const REMOTE_LOCATOR_KEYS = ["url", "href", "sourceUrl", "catalogUrl", "fetch"] as const;

export function catalogLocatorLooksRemote(value: unknown): boolean {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) || trimmed.startsWith("//");
  }
  if (isRecord(value)) {
    return REMOTE_LOCATOR_KEYS.some((key) => catalogLocatorLooksRemote(value[key]));
  }
  return false;
}

export function isRemoteCatalogLocator(value: string) {
  return catalogLocatorLooksRemote(value);
}

export function assertLocalCatalogPath(value: string, label = "path"): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${label} is required`);
  if (catalogLocatorLooksRemote(trimmed)) {
    throw new Error(`${label} must be a local file path, not a URL`);
  }
  return trimmed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asText(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

const optionalText = z.union([z.string(), z.number()]).transform((value) => String(value)).optional();
const optionalNullableNumber = z.union([z.number(), z.null()]).optional();

const vaultSongSchema = z.object({
  id: z.string().trim().min(1).max(80),
  title: z.string().trim().min(1).max(240),
  project: optionalText,
  is_original: z.boolean().optional(),
  writers: z.array(z.string()).max(20).optional(),
  key: optionalText,
  bpm: z.union([z.number(), z.string(), z.null()]).optional(),
  bpm_int: optionalNullableNumber,
  bpm_raw: optionalText,
  import_scope: z.string().trim().min(1).max(40).optional(),
  vault_id: z.string().trim().min(1).max(80).optional(),
  vault_ref: z.string().trim().min(1).max(120).optional(),
  source_key: z.string().trim().min(1).max(120).optional(),
  duration_seconds: optionalNullableNumber,
  played_live: z.array(z.string()).max(50).optional()
}).passthrough();

const vaultSetlistReadySchema = z.object({
  id: z.string().trim().min(1).max(80),
  title: z.string().trim().min(1).max(240).optional(),
  key: optionalText,
  project: optionalText,
  bpm: z.union([z.number(), z.string(), z.null()]).optional(),
  bpm_int: optionalNullableNumber,
  import_scope: z.string().trim().min(1).max(40).optional(),
  vault_ref: z.string().trim().min(1).max(120).optional()
}).passthrough();

const vaultAppApiSchema = z.object({
  schema_version: z.number().int().optional(),
  generated: z.string().optional(),
  catalog_version: z.string().optional(),
  primary_consumer: z.string().optional(),
  songs: z.array(vaultSongSchema).max(2000),
  setlist_ready: z.array(vaultSetlistReadySchema).max(2000).optional(),
  setlist_ready_default_import: z.array(vaultSetlistReadySchema).max(2000).optional(),
  lanes: z.unknown().optional(),
  storyboard: z.unknown().optional()
}).passthrough();

function vaultPayloadLooksLikeSpine(input: unknown): boolean {
  const songLooksLikeSpine = (song: unknown) => isRecord(song) && (
    "song_id" in song
    || "canonical_title" in song
    || "artist_project" in song
    || "classification" in song
  );
  if (Array.isArray(input)) return input.some(songLooksLikeSpine);
  if (!isRecord(input)) return false;
  if ("version" in input && !("schema_version" in input)) return true;
  if (!Array.isArray(input.songs)) return false;
  return input.songs.some(songLooksLikeSpine);
}

export function vaultCatalogPayloadError(input: unknown): string | null {
  if (vaultPayloadLooksLikeSpine(input)) return VAULT_SPINE_IMPORT_ERROR;
  return vaultAppApiSchema.safeParse(input).success ? null : VAULT_FEED_IMPORT_ERROR;
}

const showNightSongSchema = z.object({
  number: z.number().optional(),
  song: z.string().trim().min(1).max(240),
  cue: z.string().optional(),
  transition: z.boolean().optional(),
  special: z.boolean().optional()
}).passthrough();

const showNightGuestSetSchema = z.object({
  name: z.string().trim().min(1).max(240),
  songs: z.array(showNightSongSchema).max(100).default([])
}).passthrough();

const showNightSchema = z.object({
  event: z.object({
    name: z.string().optional(),
    venue: z.string().optional(),
    dateLong: z.string().optional()
  }).passthrough().optional(),
  guestSets: z.array(showNightGuestSetSchema).max(20).optional(),
  radDadSet: z.array(showNightSongSchema).max(100).optional(),
  flexSongs: z.array(z.string().trim().min(1).max(240)).max(50).optional()
}).passthrough();

export const catalogImportRequestSchema = z.object({
  vault: z.unknown().optional(),
  showNight: z.unknown().optional(),
  dryRun: z.boolean().default(true),
  includeParked: z.boolean().default(false),
  includeGuestSets: z.boolean().default(false),
  includeAllProjects: z.boolean().default(false)
}).strict().superRefine((value, context) => {
  if (value.vault == null && value.showNight == null) {
    context.addIssue({ code: "custom", message: "Provide a Vault data/app_api.json payload and/or a Show Night show.json payload" });
  }
  const remote = catalogLocatorLooksRemote(value.vault) || catalogLocatorLooksRemote(value.showNight);
  if (remote) {
    context.addIssue({ code: "custom", message: "Catalog import accepts local JSON payloads only; remote URLs are rejected" });
  }
  if (value.vault != null && !remote) {
    const message = vaultCatalogPayloadError(value.vault);
    if (message) context.addIssue({ code: "custom", path: ["vault"], message });
  }
});

export type CatalogImportRequest = z.infer<typeof catalogImportRequestSchema>;

export type CatalogSongDraft = {
  sourceKey: string;
  title: string;
  musicalKey: string | null;
  bpm: number | null;
  notes: string | null;
  active: boolean;
  project: string | null;
  origin: "vault" | "show_night";
};

export type CatalogSetlistItemDraft = {
  songSourceKey: string;
  itemType: "song";
  label: string;
  transitionNotes: string | null;
};

export type CatalogSetlistDraft = {
  sourceKey: string;
  name: string;
  status: "draft";
  notes: string | null;
  items: CatalogSetlistItemDraft[];
};

export type CatalogImportSkip = {
  reason: string;
  title?: string;
  project?: string;
  source?: string;
};

export type CatalogImportPlan = {
  policyVersion: typeof CATALOG_IMPORT_POLICY_VERSION;
  songs: CatalogSongDraft[];
  setlists: CatalogSetlistDraft[];
  skipped: CatalogImportSkip[];
  warnings: string[];
  counts: {
    vaultSongsSeen: number;
    showNightSongsSeen: number;
    liveSelected: number;
    parkedSkipped: number;
    notLiveSkipped: number;
    guestSetsSkipped: number;
  };
};

export type CatalogImportReconciliation = {
  policyVersion: typeof CATALOG_IMPORT_POLICY_VERSION;
  createSongs: CatalogSongDraft[];
  skipSongs: Array<CatalogImportSkip & { sourceKey: string }>;
  createSetlists: CatalogSetlistDraft[];
  skipSetlists: Array<CatalogImportSkip & { sourceKey: string }>;
};

export const CATALOG_RECORD_SOURCES = [
  "none",
  "vault",
  "show_night",
  "demo",
  "manual",
  "mixed"
] as const;

export type CatalogRecordSource = (typeof CATALOG_RECORD_SOURCES)[number];

export type CatalogRecordProvenance = {
  source: CatalogRecordSource;
  songCount: number;
  vaultSongCount: number;
  showNightSongCount: number;
  demoSongCount: number;
  manualSongCount: number;
  vaultSetlistCount: number;
  showNightSetlistCount: number;
  demoSetlistCount: number;
  manualSetlistCount: number;
};

/** Band operations Vault-slice intro is honest only for an empty table or a Vault-only library. */
export function catalogWorkspaceUsesVaultFraming(status: Pick<CatalogRecordProvenance, "source">) {
  return status.source === "none" || status.source === "vault";
}

export const CATALOG_NON_VAULT_LIBRARY_INTRO =
  "These recorded rows are not a Vault import. Vault remains the catalog; default import is still the published setlist_ready_default_import / default_live slice. Preview a local file in Band operations or use `pnpm catalog:import`. Add here only for a Band operations correction. Durations stay unknown until someone records them.";

export const CATALOG_NON_VAULT_EMPTY_SETLIST_HINT =
  "No setlist is recorded. Preview a local Vault or Show Night file in Band operations, or create one here from the songs on this artist. That is not a Vault import or a second catalog.";

export const CATALOG_BAND_OPS_IMPORT_HINT =
  "In the app, preview that same local JSON in Band operations → Music & setlists.";

export const CATALOG_SOURCE_LABELS = {
  vault: "Vault import",
  show_night: "Show Night",
  demo: "Practice data",
  manual: "Band operations"
} as const;

export function catalogSourceLabel(sourceKey?: string | null) {
  return CATALOG_SOURCE_LABELS[catalogSourceKind(sourceKey)];
}

/** Browser/CLI helper: accept pasted local JSON and refuse remote locators. */
export function parseLocalCatalogJson(text: string, label = "catalog"): unknown {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  if (catalogLocatorLooksRemote(trimmed)) {
    throw new Error(`${label} must be local JSON, not a URL`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error(`${label} must be valid JSON`);
  }
  if (catalogLocatorLooksRemote(parsed)) {
    throw new Error(`${label} must be local JSON, not a URL`);
  }
  return parsed;
}

/** Band operations Vault field: refuse the spine before POST /songs/import. */
export function parseLocalVaultFeedJson(text: string): unknown {
  const parsed = parseLocalCatalogJson(text, "Vault");
  if (parsed === undefined) return undefined;
  const message = vaultCatalogPayloadError(parsed);
  if (message) throw new Error(message);
  return parsed;
}

/** Prefer the named spine/feed sentence over a Nest flatten dump. */
export function catalogImportOperatorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? "").trim();
  if (!raw) return "Import failed";
  if (raw.includes(VAULT_SPINE_IMPORT_ERROR)) return VAULT_SPINE_IMPORT_ERROR;
  if (raw.includes(VAULT_FEED_IMPORT_ERROR)) return VAULT_FEED_IMPORT_ERROR;
  return extractCatalogImportHttpMessage(raw) ?? raw;
}

function extractCatalogImportHttpMessage(raw: string): string | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return null;
    const message = parsed.message;
    if (typeof message === "string" && message.trim()) return message.trim();
    if (!isRecord(message)) return null;
    const fieldErrors = isRecord(message.fieldErrors) ? message.fieldErrors : null;
    const vaultError = fieldErrors && Array.isArray(fieldErrors.vault) ? fieldErrors.vault[0] : null;
    if (typeof vaultError === "string" && vaultError.trim()) return vaultError.trim();
    const warning = Array.isArray(message.warnings) ? message.warnings[0] : null;
    if (typeof warning === "string" && warning.trim()) return warning.trim();
    if (typeof message.message === "string" && message.message.trim()) return message.message.trim();
  } catch {
    return null;
  }
  return null;
}

export const CATALOG_IMPORT_PREVIEW_SONG_LIMIT = 20;

export type CatalogImportPreviewView = {
  headline: string;
  songTitles: string[];
  moreSongCount: number;
  setlists: { name: string; itemCount: number }[];
  skipLines: string[];
  existingSkipLine: string | null;
  warnings: string[];
};

function countSkipReason(skipped: CatalogImportSkip[], reason: string) {
  return skipped.filter((row) => row.reason === reason).length;
}

function firstSkipTitle(skipped: CatalogImportSkip[], reason: string) {
  return skipped.find((row) => row.reason === reason)?.title;
}

/** Band operations / CLI preview: name planned titles and honest skips, not just create counts. */
export function describeCatalogImportPreview(input: {
  dryRun: boolean;
  plan: {
    songs: { title: string }[];
    setlists: { name: string; items: unknown[] }[];
    skipped: CatalogImportSkip[];
    warnings: string[];
    counts: CatalogImportPlan["counts"];
  };
  reconciliation: {
    createSongs: { title: string }[];
    createSetlists: { name: string; items: unknown[] }[];
    skipSongs: Array<{ reason: string; title?: string }>;
    skipSetlists: Array<{ reason: string; title?: string }>;
  };
  created: { songs: number; setlists: number };
}): CatalogImportPreviewView {
  const createSongs = input.reconciliation.createSongs.length;
  const createSetlists = input.reconciliation.createSetlists.length;
  const headline = input.dryRun
    ? `Dry-run: would create ${createSongs} song${createSongs === 1 ? "" : "s"} and ${createSetlists} setlist${createSetlists === 1 ? "" : "s"}. Existing titles and source keys stay skipped.`
    : `Applied: wrote ${input.created.songs} song${input.created.songs === 1 ? "" : "s"} and ${input.created.setlists} setlist${input.created.setlists === 1 ? "" : "s"}.`;
  const songTitles = input.plan.songs.slice(0, CATALOG_IMPORT_PREVIEW_SONG_LIMIT).map((song) => song.title);
  const travisCount = countSkipReason(input.plan.skipped, "travis_books");
  const coverCount = countSkipReason(input.plan.skipped, "cover_not_active");
  const showNightUnbound = countSkipReason(input.plan.skipped, "show_night_not_in_vault");
  const skipLines: string[] = [];
  if (travisCount) {
    const title = firstSkipTitle(input.plan.skipped, "travis_books");
    skipLines.push(`Travis books — ${travisCount} booker row${travisCount === 1 ? "" : "s"} stayed out${title ? ` (${title})` : ""}.`);
  }
  if (input.plan.counts.parkedSkipped) {
    skipLines.push(`${input.plan.counts.parkedSkipped} parked catalog row${input.plan.counts.parkedSkipped === 1 ? "" : "s"} stayed out — not a fourth live band.`);
  }
  if (input.plan.counts.notLiveSkipped) {
    const coverTitle = firstSkipTitle(input.plan.skipped, "cover_not_active");
    skipLines.push(coverCount
      ? `${input.plan.counts.notLiveSkipped} not-live row${input.plan.counts.notLiveSkipped === 1 ? "" : "s"} stayed out, including ${coverCount} cover${coverCount === 1 ? "" : "s"}${coverTitle ? ` (${coverTitle})` : ""}.`
      : `${input.plan.counts.notLiveSkipped} not-live row${input.plan.counts.notLiveSkipped === 1 ? "" : "s"} stayed out.`);
  }
  if (input.plan.counts.guestSetsSkipped) {
    skipLines.push(`${input.plan.counts.guestSetsSkipped} guest set${input.plan.counts.guestSetsSkipped === 1 ? "" : "s"} stayed out.`);
  }
  if (showNightUnbound) {
    skipLines.push(`${showNightUnbound} Show Night title${showNightUnbound === 1 ? "" : "s"} were not in the planned Vault slice.`);
  }
  if (countSkipReason(input.plan.skipped, "flex_pool_skipped")) {
    skipLines.push("Flex/encore pools stayed out.");
  }
  const existing = [
    ...input.reconciliation.skipSongs.map((row) => row.title ?? row.reason),
    ...input.reconciliation.skipSetlists.map((row) => row.title ?? row.reason)
  ];
  return {
    headline,
    songTitles,
    moreSongCount: Math.max(0, input.plan.songs.length - songTitles.length),
    setlists: input.plan.setlists.map((setlist) => ({ name: setlist.name, itemCount: setlist.items.length })),
    skipLines,
    existingSkipLine: existing.length
      ? `Already recorded, skipped: ${existing.slice(0, 5).join(", ")}${existing.length > 5 ? ` (+${existing.length - 5} more)` : ""}.`
      : null,
    warnings: input.plan.warnings
  };
}

export type SongCatalogStatus = CatalogRecordProvenance & {
  policyVersion: typeof CATALOG_IMPORT_POLICY_VERSION;
  empty: boolean;
  setlistCount: number;
  defaultImport: "pnpm catalog:import";
  message: string;
};

function normalizeProject(value: string | undefined) {
  return (value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function projectTokens(value: string | undefined) {
  return new Set(normalizeProject(value).split(" ").filter(Boolean));
}

function hasPhrase(tokens: Set<string>, phrase: string) {
  const parts = phrase.split(" ");
  return parts.every((part) => tokens.has(part));
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "untitled";
}

function cleanTitle(value: string) {
  return value.replace(/→/g, "").replace(/\s+/g, " ").trim();
}

function isCleanBpmInteger(value: number) {
  return Number.isInteger(value) && value >= 20 && value <= 400;
}

/** Live Vault honesty: `bpm_int` first, then a clean `bpm` integer, then a leading 2–3 digit tempo. */
function parseBpm(song: { bpm?: unknown; bpm_int?: unknown }): number | null {
  if (typeof song.bpm_int === "number" && isCleanBpmInteger(song.bpm_int)) return song.bpm_int;
  if (typeof song.bpm === "number" && isCleanBpmInteger(song.bpm)) return song.bpm;
  if (typeof song.bpm === "string") {
    const match = song.bpm.trim().match(/^(\d{2,3})\b/);
    if (!match) return null;
    const parsed = Number(match[1]);
    if (isCleanBpmInteger(parsed)) return parsed;
  }
  return null;
}

function parseKey(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text) return null;
  return text.slice(0, 30);
}

function clipNotes(value: string) {
  return value.slice(0, 2000);
}

function isLiveProject(project: string | undefined) {
  const normalized = normalizeProject(project);
  if ((LIVE_CATALOG_PROJECTS as readonly string[]).includes(normalized)) return true;
  const tokens = projectTokens(project);
  return hasPhrase(tokens, "rad dad") || hasPhrase(tokens, "jeff story");
}

function projectNameLooksParked(project: string | undefined) {
  const normalized = normalizeProject(project);
  if ((PARKED_CATALOG_PROJECTS as readonly string[]).includes(normalized)) return true;
  const tokens = projectTokens(project);
  return tokens.has("stalemate") || hasPhrase(tokens, "trailer swift") || hasPhrase(tokens, "something dirty");
}

function isParkedProject(project: string | undefined, declared?: unknown) {
  if (recognizedImportScope(declared) === "parked_catalog") return true;
  return projectNameLooksParked(project);
}

export function vaultSetlistIdentity(usedPublishedDefault: boolean) {
  return usedPublishedDefault
    ? {
        name: VAULT_DEFAULT_LIVE_SETLIST_NAME,
        notes: clipNotes("Published Vault setlist_ready_default_import / default_live slice. Current artist only — not a fourth live band. Not a booking pitch. Lanes are not a setlist. Jeff owns running order.")
      }
    : {
        name: VAULT_SETLIST_READY_SETLIST_NAME,
        notes: clipNotes("Playable Vault originals already selected for the live band. Not a booking pitch. Lanes are not a setlist. Jeff owns running order.")
      };
}

function isBookerProject(project: string | undefined) {
  const normalized = normalizeProject(project);
  if ((BOOKER_CATALOG_PROJECTS as readonly string[]).includes(normalized)) return true;
  return projectTokens(project).has("travis");
}

function playedLiveByRadDad(playedLive: string[] | undefined) {
  return (playedLive ?? []).some((row) => /rad\s*dad/i.test(row));
}

export function recognizedImportScope(declared?: unknown): CatalogImportScope | typeof CATALOG_BOOKER_POLICY | undefined {
  const declaredScope = asText(declared)?.toLowerCase().replace(/[^a-z0-9]+/g, "_");
  if (declaredScope && RECOGNIZED_IMPORT_SCOPES.has(declaredScope)) {
    return declaredScope as CatalogImportScope | typeof CATALOG_BOOKER_POLICY;
  }
  return undefined;
}

export function catalogImportScope(project: string | undefined, declared?: unknown): CatalogImportScope | typeof CATALOG_BOOKER_POLICY {
  if (isBookerProject(project)) return CATALOG_BOOKER_POLICY;
  const declaredScope = recognizedImportScope(declared);
  if (declaredScope) return declaredScope;
  if (isLiveProject(project)) return "default_live";
  if (isParkedProject(project)) return "parked_catalog";
  return "not_live_band";
}

function skipFields(title: string, project: string | undefined, source: string): CatalogImportSkip {
  return {
    reason: "",
    title,
    ...(project != null && String(project).trim() ? { project: String(project) } : {}),
    source
  };
}

function decideVaultSong(
  song: z.infer<typeof vaultSongSchema>,
  options: {
    includeParked: boolean;
    includeAllProjects: boolean;
    publishedDefaultIds: Set<string> | null;
    hasDeclaredScopes: boolean;
    hasReadyList: boolean;
    inReadySet: boolean;
  }
): { include: true } | { include: false; reason: string } {
  const declared = recognizedImportScope(song.import_scope);
  if (isBookerProject(song.project) || declared === CATALOG_BOOKER_POLICY) {
    return { include: false, reason: "travis_books" };
  }
  if (!options.includeAllProjects && (song.is_original === false || declared === "cover_not_active")) {
    return { include: false, reason: "cover_not_active" };
  }
  if (options.includeAllProjects) return { include: true };

  const parked = isParkedProject(song.project, song.import_scope);
  const live = isLiveProject(song.project) || playedLiveByRadDad(song.played_live);

  if (options.publishedDefaultIds) {
    if (options.publishedDefaultIds.has(song.id)) return { include: true };
    if (options.includeParked && parked) return { include: true };
    if (declared && declared !== "default_live") return { include: false, reason: declared };
    if (parked) return { include: false, reason: "parked_catalog" };
    return { include: false, reason: options.hasReadyList || options.publishedDefaultIds.size === 0 ? "not_setlist_ready" : "not_live_band" };
  }

  if (options.hasDeclaredScopes) {
    const scope = catalogImportScope(song.project, song.import_scope);
    if (scope === "default_live") return { include: true };
    if (scope === "parked_catalog") {
      return options.includeParked ? { include: true } : { include: false, reason: "parked_catalog" };
    }
    return { include: false, reason: scope };
  }

  if (options.hasReadyList && options.inReadySet) {
    if (parked && !live && !options.includeParked) return { include: false, reason: "parked_catalog" };
    if (!live && !parked) return { include: false, reason: "not_live_band" };
    return { include: true };
  }

  if (options.hasReadyList && !options.inReadySet) {
    if (options.includeParked && parked) return { include: true };
    return { include: false, reason: "not_setlist_ready" };
  }

  if (parked && !live && !options.includeParked) return { include: false, reason: "parked_catalog" };
  if (!live && !parked) return { include: false, reason: "not_live_band" };
  return { include: true };
}

function vaultSongDraft(song: z.infer<typeof vaultSongSchema>): CatalogSongDraft {
  const vaultId = song.vault_id ?? song.id;
  return {
    sourceKey: `vault:${CATALOG_IMPORT_POLICY_VERSION}:${vaultId}`,
    title: cleanTitle(song.title),
    musicalKey: parseKey(song.key),
    bpm: parseBpm(song),
    notes: clipNotes(song.vault_ref ?? `vault:${vaultId}`),
    active: song.is_original !== false,
    project: song.project ? String(song.project) : null,
    origin: "vault"
  };
}

function upsertSong(songs: CatalogSongDraft[], draft: CatalogSongDraft) {
  const existingKey = songs.find((song) => song.sourceKey === draft.sourceKey);
  if (existingKey) return existingKey.sourceKey;
  const duplicateTitle = songs.find((song) => song.title.toLocaleLowerCase() === draft.title.toLocaleLowerCase());
  if (duplicateTitle) {
    if (draft.origin === "vault" && duplicateTitle.origin !== "vault") {
      const index = songs.indexOf(duplicateTitle);
      songs[index] = { ...draft, sourceKey: duplicateTitle.sourceKey };
    }
    return duplicateTitle.sourceKey;
  }
  songs.push(draft);
  return draft.sourceKey;
}

export function planCatalogImport(input: {
  vault?: unknown;
  showNight?: unknown;
  includeParked?: boolean;
  includeGuestSets?: boolean;
  includeAllProjects?: boolean;
} = {}): CatalogImportPlan {
  const includeParked = input.includeParked === true;
  const includeGuestSets = input.includeGuestSets === true;
  const includeAllProjects = input.includeAllProjects === true;
  const songs: CatalogSongDraft[] = [];
  const setlists: CatalogSetlistDraft[] = [];
  const skipped: CatalogImportSkip[] = [];
  const warnings: string[] = [];
  let vaultSongsSeen = 0;
  let showNightSongsSeen = 0;
  let parkedSkipped = 0;
  let notLiveSkipped = 0;
  let guestSetsSkipped = 0;
  let vaultCatalogResolved = false;
  let vaultPayloadRejected = false;
  const vaultSkipByTitle = new Map<string, string>();

  function showNightSongSourceKey(title: string, draft: CatalogSongDraft): string | null {
    if (vaultCatalogResolved) {
      const planned = songs.find((song) => song.title.toLocaleLowerCase() === title.toLocaleLowerCase());
      if (planned) return planned.sourceKey;
      const reason = vaultSkipByTitle.get(title.toLocaleLowerCase()) ?? "show_night_not_in_vault";
      skipped.push({ ...skipFields(title, draft.project ?? undefined, "show_night"), reason });
      return null;
    }
    return upsertSong(songs, draft);
  }

  if (catalogLocatorLooksRemote(input.vault) || catalogLocatorLooksRemote(input.showNight)) {
    warnings.push("Catalog locators must be local JSON objects, not URLs or file paths.");
  }

  if (input.vault != null && !catalogLocatorLooksRemote(input.vault)) {
    const validationError = vaultCatalogPayloadError(input.vault);
    const parsed = vaultAppApiSchema.safeParse(input.vault);
    if (validationError || !parsed.success) {
      vaultPayloadRejected = true;
      warnings.push(validationError ?? VAULT_FEED_IMPORT_ERROR);
    } else {
      vaultCatalogResolved = true;
      if (parsed.data.lanes != null) {
        warnings.push("Vault lanes are WIP slots, not a setlist. Jeff owns running order.");
      }
      if (isRecord(parsed.data.storyboard) && isRecord(parsed.data.storyboard.field_map)) {
        const map = parsed.data.storyboard.field_map;
        if (asText(map.bpm) && asText(map.bpm) !== "bpm_int") {
          warnings.push("Vault storyboard.field_map.bpm is not bpm_int; StoryBoard still prefers bpm_int and will not invent tempo.");
        }
      }
      const publishedDefaultRows = Array.isArray(parsed.data.setlist_ready_default_import)
        ? parsed.data.setlist_ready_default_import
        : null;
      const publishedDefaultIds = publishedDefaultRows
        ? new Set(publishedDefaultRows.map((row) => row.id))
        : null;
      const usedPublishedDefault = publishedDefaultRows != null && !includeAllProjects && !includeParked;
      const readyRows = includeAllProjects || includeParked
        ? (parsed.data.setlist_ready ?? [])
        : publishedDefaultRows ?? parsed.data.setlist_ready ?? [];
      const fallbackReadyRows = parsed.data.setlist_ready ?? [];
      const hasReadyList = fallbackReadyRows.length > 0;
      const readyIds = new Set(fallbackReadyRows.map((row) => row.id));
      const hasDeclaredScopes = parsed.data.songs.some((song) => recognizedImportScope(song.import_scope));
      const songsById = new Map(parsed.data.songs.map((song) => [song.id, song]));

      for (const song of parsed.data.songs) {
        vaultSongsSeen += 1;
        const decision = decideVaultSong(song, {
          includeParked,
          includeAllProjects,
          publishedDefaultIds,
          hasDeclaredScopes,
          hasReadyList,
          inReadySet: readyIds.has(song.id)
        });
        if (!decision.include) {
          vaultSkipByTitle.set(cleanTitle(song.title).toLocaleLowerCase(), decision.reason);
          if (decision.reason === "parked_catalog") parkedSkipped += 1;
          if (decision.reason === "not_live_band" || decision.reason === "not_setlist_ready" || decision.reason === "cover_not_active") {
            notLiveSkipped += 1;
          }
          skipped.push({ ...skipFields(song.title, song.project, song.id), reason: decision.reason });
          continue;
        }
        upsertSong(songs, vaultSongDraft(song));
      }

      const readyItems: CatalogSetlistItemDraft[] = [];
      for (const row of readyRows) {
        const sourceSong = songsById.get(row.id);
        const planned = songs.find((song) => song.sourceKey === `vault:${CATALOG_IMPORT_POLICY_VERSION}:${row.id}`)
          ?? (row.title
            ? songs.find((song) => song.title.toLocaleLowerCase() === cleanTitle(row.title!).toLocaleLowerCase())
            : undefined);
        if (!planned) {
          skipped.push({
            ...skipFields(row.title ?? row.id, row.project ?? sourceSong?.project, row.id),
            reason: "setlist_ready_not_live"
          });
          continue;
        }
        readyItems.push({
          songSourceKey: planned.sourceKey,
          itemType: "song",
          label: planned.title,
          transitionNotes: null
        });
      }
      if (readyItems.length) {
        const identity = vaultSetlistIdentity(usedPublishedDefault);
        setlists.push({
          sourceKey: `vault:${CATALOG_IMPORT_POLICY_VERSION}:set:setlist-ready`,
          name: identity.name,
          status: "draft",
          notes: identity.notes,
          items: readyItems
        });
      }
      if (usedPublishedDefault && songs.some((song) => projectNameLooksParked(song.project ?? undefined))) {
        warnings.push("Published default-live includes songs whose Vault project is a parked catalog name. They stay on the current artist — not a fourth live band.");
      }
    }
  }

  if (input.showNight != null && !vaultPayloadRejected && !catalogLocatorLooksRemote(input.showNight)) {
    const parsed = showNightSchema.safeParse(input.showNight);
    if (!parsed.success) {
      warnings.push("Show Night payload is not a valid show.json export. No show-night songs or setlists were planned.");
    } else {
      const eventLabel = [parsed.data.event?.name, parsed.data.event?.venue, parsed.data.event?.dateLong].filter(Boolean).join(" · ") || "Show Night";
      const official = parsed.data.radDadSet ?? [];
      const officialItems: CatalogSetlistItemDraft[] = [];
      for (const row of official) {
        showNightSongsSeen += 1;
        const title = cleanTitle(row.song);
        const sourceKey = showNightSongSourceKey(title, {
          sourceKey: `shownight:${CATALOG_IMPORT_POLICY_VERSION}:song:rad-dad:${slug(title)}`,
          title,
          musicalKey: null,
          bpm: null,
          notes: clipNotes(`Show Night official set${row.special ? " · special" : ""}`),
          active: true,
          project: "Rad Dad",
          origin: "show_night"
        });
        if (!sourceKey) continue;
        officialItems.push({
          songSourceKey: sourceKey,
          itemType: "song",
          label: title,
          transitionNotes: row.transition ? "Flows to next" : row.cue?.trim() ? row.cue.trim().slice(0, 1000) : null
        });
      }
      if (officialItems.length) {
        setlists.push({
          sourceKey: `shownight:${CATALOG_IMPORT_POLICY_VERSION}:set:rad-dad`,
          name: "Rad Dad — official set",
          status: "draft",
          notes: clipNotes(eventLabel),
          items: officialItems
        });
      }

      for (const guest of parsed.data.guestSets ?? []) {
        const guestProject = normalizeProject(guest.name);
        if (!includeGuestSets) {
          guestSetsSkipped += 1;
          skipped.push({ reason: "guest_set_skipped", title: guest.name, project: guest.name });
          continue;
        }
        const guestSlug = slug(guest.name);
        const items: CatalogSetlistItemDraft[] = [];
        for (const row of guest.songs) {
          showNightSongsSeen += 1;
          const title = cleanTitle(row.song);
          const sourceKey = showNightSongSourceKey(title, {
            sourceKey: `shownight:${CATALOG_IMPORT_POLICY_VERSION}:song:${guestSlug}:${slug(title)}`,
            title,
            musicalKey: null,
            bpm: null,
            notes: clipNotes(`Show Night guest set · ${guest.name}`),
            active: true,
            project: guest.name,
            origin: "show_night"
          });
          if (!sourceKey) continue;
          items.push({
            songSourceKey: sourceKey,
            itemType: "song",
            label: title,
            transitionNotes: row.cue?.trim() ? row.cue.trim().slice(0, 1000) : null
          });
        }
        if (items.length) {
          setlists.push({
            sourceKey: `shownight:${CATALOG_IMPORT_POLICY_VERSION}:set:${guestSlug}`,
            name: `${guest.name} — guest set`,
            status: "draft",
            notes: clipNotes(`Imported onto the current artist only. ${eventLabel}${isParkedProject(guestProject) ? " Parked catalog act; not a new live band." : ""}`),
            items
          });
        }
      }

      if ((parsed.data.flexSongs ?? []).length) {
        skipped.push({ reason: "flex_pool_skipped", title: `${parsed.data.flexSongs!.length} flex songs` });
      }
    }
  }

  if (input.vault == null && input.showNight == null) {
    warnings.push("No catalog payload was provided.");
  }

  if (input.vault != null && !catalogLocatorLooksRemote(input.vault) && vaultSongsSeen > 0 && songs.length === 0) {
    warnings.push("Vault songs were seen but none matched the published default-live slice (setlist_ready_default_import / import_scope=default_live). StoryBoard will not invent a live band or a second catalog.");
  }

  return {
    policyVersion: CATALOG_IMPORT_POLICY_VERSION,
    songs,
    setlists,
    skipped,
    warnings,
    counts: {
      vaultSongsSeen,
      showNightSongsSeen,
      liveSelected: songs.length,
      parkedSkipped,
      notLiveSkipped,
      guestSetsSkipped
    }
  };
}

export function reconcileCatalogImport(
  plan: CatalogImportPlan,
  existing: {
    songs: { id: string; title: string; sourceKey?: string | null }[];
    setlists: { id: string; sourceKey?: string | null }[];
  }
): CatalogImportReconciliation {
  const songsBySourceKey = new Map(existing.songs.filter((song) => song.sourceKey).map((song) => [song.sourceKey!, song]));
  const songsByTitle = new Map(existing.songs.map((song) => [song.title.toLocaleLowerCase(), song]));
  const setlistsBySourceKey = new Map(existing.setlists.filter((setlist) => setlist.sourceKey).map((setlist) => [setlist.sourceKey!, setlist]));

  const createSongs: CatalogSongDraft[] = [];
  const skipSongs: Array<CatalogImportSkip & { sourceKey: string }> = [];
  for (const song of plan.songs) {
    if (songsBySourceKey.has(song.sourceKey)) {
      skipSongs.push({ sourceKey: song.sourceKey, title: song.title, reason: "source_key_exists" });
      continue;
    }
    if (songsByTitle.has(song.title.toLocaleLowerCase())) {
      skipSongs.push({ sourceKey: song.sourceKey, title: song.title, reason: "title_exists" });
      continue;
    }
    createSongs.push(song);
  }

  const createSetlists: CatalogSetlistDraft[] = [];
  const skipSetlists: Array<CatalogImportSkip & { sourceKey: string }> = [];
  for (const setlist of plan.setlists) {
    if (setlistsBySourceKey.has(setlist.sourceKey)) {
      skipSetlists.push({ sourceKey: setlist.sourceKey, title: setlist.name, reason: "source_key_exists" });
      continue;
    }
    createSetlists.push(setlist);
  }

  return {
    policyVersion: CATALOG_IMPORT_POLICY_VERSION,
    createSongs,
    skipSongs,
    createSetlists,
    skipSetlists
  };
}

export function catalogSourceKind(sourceKey?: string | null): Exclude<CatalogRecordSource, "none" | "mixed"> {
  const key = sourceKey ?? "";
  if (key.startsWith("vault:")) return "vault";
  if (key.startsWith("shownight:")) return "show_night";
  if (key.startsWith("seed:demo:")) return "demo";
  return "manual";
}

function countCatalogKinds(rows: { sourceKey?: string | null }[]) {
  let vault = 0;
  let showNight = 0;
  let demo = 0;
  let manual = 0;
  for (const row of rows) {
    const kind = catalogSourceKind(row.sourceKey);
    if (kind === "vault") vault += 1;
    else if (kind === "show_night") showNight += 1;
    else if (kind === "demo") demo += 1;
    else manual += 1;
  }
  return { vault, showNight, demo, manual };
}

export function catalogRecordProvenance(
  songs: { sourceKey?: string | null }[],
  setlists: { sourceKey?: string | null }[] = []
): CatalogRecordProvenance {
  const songKinds = countCatalogKinds(songs);
  const setlistKinds = countCatalogKinds(setlists);
  const songPresent = (
    [
      songKinds.vault ? "vault" : null,
      songKinds.showNight ? "show_night" : null,
      songKinds.demo ? "demo" : null,
      songKinds.manual ? "manual" : null
    ] as const
  ).filter((value): value is Exclude<CatalogRecordSource, "none" | "mixed"> => Boolean(value));
  // A Band operations setlist (null sourceKey) is a running order, not a second catalog.
  // Show Night / demo / Vault setlists can still make a single-source song table mixed.
  const extraCatalogSetlistKinds = (
    [
      setlistKinds.vault && !songKinds.vault ? "vault" : null,
      setlistKinds.showNight && !songKinds.showNight ? "show_night" : null,
      setlistKinds.demo && !songKinds.demo ? "demo" : null
    ] as const
  ).filter((value): value is Exclude<CatalogRecordSource, "none" | "mixed" | "manual"> => Boolean(value));
  return {
    source: songs.length === 0
      ? "none"
      : songPresent.length === 1 && extraCatalogSetlistKinds.length === 0
        ? songPresent[0]!
        : "mixed",
    songCount: songs.length,
    vaultSongCount: songKinds.vault,
    showNightSongCount: songKinds.showNight,
    demoSongCount: songKinds.demo,
    manualSongCount: songKinds.manual,
    vaultSetlistCount: setlistKinds.vault,
    showNightSetlistCount: setlistKinds.showNight,
    demoSetlistCount: setlistKinds.demo,
    manualSetlistCount: setlistKinds.manual
  };
}

function catalogStatusMessage(provenance: CatalogRecordProvenance): string {
  if (provenance.source === "none") {
    return "No songs are recorded. Vault is the catalog; default import is the published setlist_ready_default_import / default_live slice from a local app_api.json (`pnpm catalog:import`, then --apply). Preview the same local JSON in Band operations → Music & setlists. This empty table is not a second catalog.";
  }
  const countLabel = `${provenance.songCount} song${provenance.songCount === 1 ? "" : "s"} recorded`;
  if (provenance.source === "vault") {
    return `${countLabel} (${provenance.vaultSongCount} from Vault). Default import is Vault's published setlist_ready_default_import / default_live slice on the current artist — not a fourth live band. Duration stays unknown until Band operations records it.`;
  }
  if (provenance.source === "show_night") {
    return `${countLabel} from Show Night on the current artist — not a fourth live band. Vault remains the catalog; Show Night is a running-order import, not a second catalog.`;
  }
  if (provenance.source === "demo") {
    return `${countLabel} from SEED_DEMO_OPS practice data. This is not a live catalog and not a Vault import. Default import is still the published setlist_ready_default_import / default_live slice.`;
  }
  if (provenance.source === "manual") {
    return `${countLabel} as Band operations corrections. This is not a Vault import and not a second catalog. Default import remains the published setlist_ready_default_import / default_live slice.`;
  }
  const parts = [
    provenance.vaultSongCount ? `${provenance.vaultSongCount} from Vault` : null,
    provenance.showNightSongCount ? `${provenance.showNightSongCount} from Show Night` : null,
    provenance.demoSongCount ? `${provenance.demoSongCount} practice/demo` : null,
    provenance.manualSongCount ? `${provenance.manualSongCount} Band operations` : null,
    provenance.showNightSetlistCount && !provenance.showNightSongCount
      ? `${provenance.showNightSetlistCount} Show Night running-order setlist${provenance.showNightSetlistCount === 1 ? "" : "s"}`
      : null,
    provenance.demoSetlistCount && !provenance.demoSongCount
      ? `${provenance.demoSetlistCount} practice/demo setlist${provenance.demoSetlistCount === 1 ? "" : "s"}`
      : null,
    provenance.vaultSetlistCount && !provenance.vaultSongCount
      ? `${provenance.vaultSetlistCount} Vault setlist${provenance.vaultSetlistCount === 1 ? "" : "s"}`
      : null
  ].filter((part): part is string => Boolean(part));
  return `${countLabel} (${parts.join(", ")}). Vault rows follow the published setlist_ready_default_import / default_live slice on the current artist; Show Night, practice/demo, and one-off rows are not a live catalog or a fourth live band.`;
}

export function describeSongCatalogStatus(input: {
  songs: { sourceKey?: string | null }[];
  setlists: { sourceKey?: string | null }[];
}): SongCatalogStatus {
  const provenance = catalogRecordProvenance(input.songs, input.setlists);
  return {
    policyVersion: CATALOG_IMPORT_POLICY_VERSION,
    empty: provenance.songCount === 0,
    setlistCount: input.setlists.length,
    defaultImport: "pnpm catalog:import",
    message: catalogStatusMessage(provenance),
    ...provenance
  };
}

export function managerRecordsFromCatalogPlan(plan: CatalogImportPlan) {
  return {
    songs: plan.songs.map((song) => ({
      id: song.sourceKey,
      title: song.title,
      active: song.active,
      musicalKey: song.musicalKey,
      sourceKey: song.sourceKey
    })),
    setlists: plan.setlists.map((setlist) => ({
      id: setlist.sourceKey,
      name: setlist.name,
      status: setlist.status,
      itemCount: setlist.items.length,
      sourceKey: setlist.sourceKey
    }))
  };
}
