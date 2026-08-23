import { z } from "zod";

export const CATALOG_IMPORT_POLICY_VERSION = "catalog_import_v1" as const;
/** Exact Vault `artist_project` match only. Hybrids are not a live band. */
export const LIVE_CATALOG_PROJECTS = ["rad dad"] as const;
export const PARKED_CATALOG_PROJECTS = ["stalemate", "trailer swift", "something dirty"] as const;
export const BOOKER_CATALOG_PROJECTS = ["travis", "travis story"] as const;
export const CATALOG_IMPORT_SCOPES = ["default_live", "parked_catalog", "not_live_band"] as const;
export const VAULT_SAMPLE_CATALOG_RELATIVE_PATH = "packages/shared/test/fixtures/vault-app-api.sample.json";

/** Travis is the human booker. StoryBoard never auto-pitches him. */
export const CATALOG_BOOKER_POLICY = "travis_books" as const;

/** Live Vault `storyboard.field_map` honesty (AI-Music-Vault, 2026-08-23). */
export const VAULT_STORYBOARD_FIELD_MAP = {
  title: "title",
  musicalKey: "key",
  bpm: "bpm",
  sourceKey: `vault:${CATALOG_IMPORT_POLICY_VERSION}:{id}`,
  notes: "constructed: source {id} · {project} · original|not original",
  active: "always true on import — not is_original"
} as const;

export type CatalogImportScope = (typeof CATALOG_IMPORT_SCOPES)[number];

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

function asStringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value.map(asText).filter((item): item is string => Boolean(item));
  return items.length ? items : undefined;
}

function normalizeVaultSong(song: unknown): unknown {
  if (!isRecord(song)) return song;
  const id = asText(song.id) ?? asText(song.song_id) ?? asText(song.vault_id);
  const title = asText(song.title) ?? asText(song.canonical_title);
  const project = asText(song.project) ?? asText(song.artist_project);
  const vaultId = asText(song.vault_id) ?? id;
  const vaultRef = asText(song.vault_ref) ?? (vaultId ? `vault:${vaultId}` : undefined);
  let isOriginal = song.is_original;
  if (typeof isOriginal !== "boolean") {
    const classification = asText(song.classification)?.toLowerCase();
    if (classification === "original") isOriginal = true;
    else if (classification === "cover") isOriginal = false;
  }
  const playedLive = asStringList(song.played_live);
  return {
    ...song,
    ...(id ? { id } : {}),
    ...(title ? { title } : {}),
    ...(project ? { project } : {}),
    ...(vaultId ? { vault_id: vaultId } : {}),
    ...(vaultRef ? { vault_ref: vaultRef } : {}),
    ...(typeof isOriginal === "boolean" ? { is_original: isOriginal } : {}),
    ...(playedLive ? { played_live: playedLive } : {})
  };
}

/** Accept Vault `app_api.json` or `master_catalog.json` (or a raw song array). */
export function normalizeVaultCatalog(input: unknown): unknown {
  if (input == null) return input;
  if (Array.isArray(input)) return { songs: input.map(normalizeVaultSong) };
  if (!isRecord(input)) return input;
  if (!Array.isArray(input.songs)) return input;
  return { ...input, songs: input.songs.map(normalizeVaultSong) };
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
    context.addIssue({ code: "custom", message: "Provide a Vault app_api.json or master_catalog.json payload and/or a Show Night show.json payload" });
  }
  if (catalogLocatorLooksRemote(value.vault) || catalogLocatorLooksRemote(value.showNight)) {
    context.addIssue({ code: "custom", message: "Catalog import accepts local JSON payloads only; remote URLs are rejected" });
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

export type SongCatalogStatus = {
  policyVersion: typeof CATALOG_IMPORT_POLICY_VERSION;
  empty: boolean;
  songCount: number;
  setlistCount: number;
  vaultSongCount: number;
  source: "none" | "vault" | "manual" | "mixed";
  defaultImport: "pnpm catalog:import";
  message: string;
};

function normalizeProject(value: string | undefined) {
  return (value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function projectTokens(value: string | undefined) {
  return new Set(normalizeProject(value).split(" ").filter(Boolean));
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

/** Live Vault honesty: prefer clean `bpm`. Do not parse annotations such as `214 (cut)`. */
function parseBpm(song: { bpm?: unknown; bpm_int?: unknown }): number | null {
  if (typeof song.bpm === "number" && isCleanBpmInteger(song.bpm)) return song.bpm;
  if (typeof song.bpm === "string") {
    const trimmed = song.bpm.trim();
    if (/^\d{2,3}$/.test(trimmed)) {
      const parsed = Number(trimmed);
      if (isCleanBpmInteger(parsed)) return parsed;
    }
  }
  if (typeof song.bpm_int === "number" && isCleanBpmInteger(song.bpm_int)) return song.bpm_int;
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

export function constructedVaultNotes(
  songId: string,
  project: string | null | undefined,
  isOriginal: boolean | undefined
) {
  const parts = [`source ${songId}`];
  if (project && String(project).trim()) parts.push(String(project).trim());
  if (isOriginal === true) parts.push("original");
  else if (isOriginal === false) parts.push("not original");
  return clipNotes(parts.join(" · "));
}

function isBookerProject(project: string | undefined) {
  const normalized = normalizeProject(project);
  if ((BOOKER_CATALOG_PROJECTS as readonly string[]).includes(normalized)) return true;
  return projectTokens(project).has("travis");
}

export function catalogImportScope(project: string | undefined, declared?: unknown): CatalogImportScope | typeof CATALOG_BOOKER_POLICY {
  if (isBookerProject(project)) return CATALOG_BOOKER_POLICY;
  const declaredScope = asText(declared)?.toLowerCase().replace(/[^a-z0-9]+/g, "_");
  if (declaredScope === "default_live" || declaredScope === "parked_catalog" || declaredScope === "not_live_band") {
    return declaredScope;
  }
  const normalized = normalizeProject(project);
  if ((LIVE_CATALOG_PROJECTS as readonly string[]).includes(normalized)) return "default_live";
  if ((PARKED_CATALOG_PROJECTS as readonly string[]).includes(normalized)) return "parked_catalog";
  return "not_live_band";
}

function isParkedProject(project: string | undefined, declared?: unknown) {
  return catalogImportScope(project, declared) === "parked_catalog";
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
  options: { includeParked: boolean; includeAllProjects: boolean }
): { include: true } | { include: false; reason: string } {
  const scope = catalogImportScope(song.project, song.import_scope);
  if (scope === CATALOG_BOOKER_POLICY) return { include: false, reason: "travis_books" };
  if (options.includeAllProjects) return { include: true };
  if (scope === "default_live") return { include: true };
  if (scope === "parked_catalog") {
    return options.includeParked ? { include: true } : { include: false, reason: "parked_catalog" };
  }
  return { include: false, reason: "not_live_band" };
}

function vaultSongDraft(song: z.infer<typeof vaultSongSchema>): CatalogSongDraft {
  const vaultId = song.vault_id ?? song.id;
  return {
    sourceKey: `vault:${CATALOG_IMPORT_POLICY_VERSION}:${vaultId}`,
    title: cleanTitle(song.title),
    musicalKey: parseKey(song.key),
    bpm: parseBpm(song),
    notes: constructedVaultNotes(vaultId, song.project ? String(song.project) : null, song.is_original),
    active: true,
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

  if (catalogLocatorLooksRemote(input.vault) || catalogLocatorLooksRemote(input.showNight)) {
    warnings.push("Catalog locators must be local JSON objects, not URLs or file paths.");
  }

  if (input.vault != null && !catalogLocatorLooksRemote(input.vault)) {
    const parsed = vaultAppApiSchema.safeParse(normalizeVaultCatalog(input.vault));
    if (!parsed.success) {
      warnings.push("Vault payload is not a valid app_api.json or master_catalog.json catalog. No vault songs were planned.");
    } else {
      if (parsed.data.lanes != null) {
        warnings.push("Vault lanes are WIP slots, not a setlist. Jeff owns running order.");
      }
      if (isRecord(parsed.data.storyboard) && isRecord(parsed.data.storyboard.field_map)) {
        const map = parsed.data.storyboard.field_map;
        if (asText(map.bpm) === "bpm_int") {
          warnings.push("Vault storyboard.field_map.bpm is bpm_int; live Vault honesty maps bpm from songs[].bpm. StoryBoard prefers a clean bpm integer and will not invent tempo.");
        }
        if (asText(map.notes) === "vault_ref") {
          warnings.push("Vault storyboard.field_map.notes is vault_ref; live Vault honesty constructs source {id} · {project} · original|not original.");
        }
        if (asText(map.active) === "is_original") {
          warnings.push("Vault storyboard.field_map.active is is_original; live Vault honesty keeps imported rows active.");
        }
      }
      const defaultReadyRows = parsed.data.setlist_ready_default_import;
      const readyRows = includeAllProjects || includeParked
        ? (parsed.data.setlist_ready ?? [])
        : Array.isArray(defaultReadyRows)
          ? defaultReadyRows
          : (parsed.data.setlist_ready ?? []);
      const songsById = new Map(parsed.data.songs.map((song) => [song.id, song]));

      for (const song of parsed.data.songs) {
        vaultSongsSeen += 1;
        const decision = decideVaultSong(song, { includeParked, includeAllProjects });
        if (!decision.include) {
          if (decision.reason === "parked_catalog" || isParkedProject(song.project, song.import_scope)) parkedSkipped += 1;
          if (decision.reason === "not_live_band") notLiveSkipped += 1;
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
        setlists.push({
          sourceKey: `vault:${CATALOG_IMPORT_POLICY_VERSION}:set:setlist-ready`,
          name: "Vault setlist-ready",
          status: "draft",
          notes: clipNotes("Playable Vault originals already selected for the live band. Not a booking pitch. Lanes are not a setlist. Jeff owns running order."),
          items: readyItems
        });
      }
    }
  }

  if (input.showNight != null && !catalogLocatorLooksRemote(input.showNight)) {
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
        const sourceKey = upsertSong(songs, {
          sourceKey: `shownight:${CATALOG_IMPORT_POLICY_VERSION}:song:rad-dad:${slug(title)}`,
          title,
          musicalKey: null,
          bpm: null,
          notes: clipNotes(`Show Night official set${row.special ? " · special" : ""}`),
          active: true,
          project: "Rad Dad",
          origin: "show_night"
        });
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
          const sourceKey = upsertSong(songs, {
            sourceKey: `shownight:${CATALOG_IMPORT_POLICY_VERSION}:song:${guestSlug}:${slug(title)}`,
            title,
            musicalKey: null,
            bpm: null,
            notes: clipNotes(`Show Night guest set · ${guest.name}`),
            active: true,
            project: guest.name,
            origin: "show_night"
          });
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
    warnings.push("Vault songs were seen but none are labeled Rad Dad (default_live). live_presence / played_live is not artist_project. Writer projects and parked catalogs stay out unless you opt in. StoryBoard will not invent a live band or a second catalog.");
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

export function describeSongCatalogStatus(input: {
  songs: { sourceKey?: string | null }[];
  setlists: { sourceKey?: string | null }[];
}): SongCatalogStatus {
  const songCount = input.songs.length;
  const setlistCount = input.setlists.length;
  const vaultSongCount = input.songs.filter((song) => song.sourceKey?.startsWith("vault:")).length;
  const empty = songCount === 0;
  const source = empty ? "none" : vaultSongCount === 0 ? "manual" : vaultSongCount === songCount ? "vault" : "mixed";
  return {
    policyVersion: CATALOG_IMPORT_POLICY_VERSION,
    empty,
    songCount,
    setlistCount,
    vaultSongCount,
    source,
    defaultImport: "pnpm catalog:import",
    message: empty
      ? "No songs are recorded. Vault is the catalog; default import is Rad Dad rows from a local app_api.json (`pnpm catalog:import`, then --apply). Writer projects and parked catalogs stay out unless you opt in. This empty table is not a second catalog."
      : `${songCount} song${songCount === 1 ? "" : "s"} recorded${vaultSongCount ? ` (${vaultSongCount} from Vault)` : ""}.`
  };
}

export function managerRecordsFromCatalogPlan(plan: CatalogImportPlan) {
  return {
    songs: plan.songs.map((song) => ({
      id: song.sourceKey,
      title: song.title,
      active: song.active,
      musicalKey: song.musicalKey
    })),
    setlists: plan.setlists.map((setlist) => ({
      id: setlist.sourceKey,
      name: setlist.name,
      status: setlist.status,
      itemCount: setlist.items.length
    }))
  };
}
