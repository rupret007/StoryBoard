import { z } from "zod";

export const CATALOG_IMPORT_POLICY_VERSION = "catalog_import_v1" as const;
export const LIVE_CATALOG_PROJECTS = ["rad dad"] as const;
export const PARKED_CATALOG_PROJECTS = ["stalemate", "trailer swift", "something dirty"] as const;

const optionalText = z.union([z.string(), z.number()]).transform((value) => String(value)).optional();

const vaultSongSchema = z.object({
  id: z.string().trim().min(1).max(80),
  title: z.string().trim().min(1).max(240),
  project: optionalText,
  is_original: z.boolean().optional(),
  writers: z.array(z.string()).max(20).optional(),
  key: optionalText,
  bpm: z.union([z.number(), z.string()]).optional()
}).passthrough();

const vaultAppApiSchema = z.object({
  schema_version: z.number().int().optional(),
  generated: z.string().optional(),
  catalog_version: z.string().optional(),
  songs: z.array(vaultSongSchema).max(2000)
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
    context.addIssue({ code: "custom", message: "Provide a Vault app_api.json payload and/or a Show Night show.json payload" });
  }
});

export type CatalogImportRequest = z.infer<typeof catalogImportRequestSchema>;

export type CatalogSongDraft = {
  sourceKey: string;
  title: string;
  musicalKey: string | null;
  bpm: number | null;
  notes: string | null;
  active: true;
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

function normalizeProject(value: string | undefined) {
  return (value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "untitled";
}

function cleanTitle(value: string) {
  return value.replace(/→/g, "").replace(/\s+/g, " ").trim();
}

function parseBpm(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value >= 20 && value <= 400) return value;
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (Number.isInteger(parsed) && parsed >= 20 && parsed <= 400) return parsed;
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

function isLiveProject(project: string) {
  return (LIVE_CATALOG_PROJECTS as readonly string[]).includes(project);
}

function isParkedProject(project: string) {
  return (PARKED_CATALOG_PROJECTS as readonly string[]).includes(project);
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
  let guestSetsSkipped = 0;

  if (input.vault != null) {
    const parsed = vaultAppApiSchema.safeParse(input.vault);
    if (!parsed.success) {
      warnings.push("Vault payload is not a valid app_api.json catalog. No vault songs were planned.");
    } else {
      for (const song of parsed.data.songs) {
        vaultSongsSeen += 1;
        const project = normalizeProject(song.project);
        if (!includeAllProjects && !isLiveProject(project)) {
          if (isParkedProject(project) && !includeParked) {
            parkedSkipped += 1;
            skipped.push({ reason: "parked_catalog", title: song.title, project: song.project ? String(song.project) : undefined, source: song.id });
            continue;
          }
          if (!isParkedProject(project)) {
            skipped.push({ reason: "not_live_band", title: song.title, project: song.project ? String(song.project) : undefined, source: song.id });
            continue;
          }
        }
        upsertSong(songs, {
          sourceKey: `vault:${CATALOG_IMPORT_POLICY_VERSION}:${song.id}`,
          title: cleanTitle(song.title),
          musicalKey: parseKey(song.key),
          bpm: parseBpm(song.bpm),
          notes: clipNotes([
            `source ${song.id}`,
            song.project ? String(song.project) : null,
            song.is_original === true ? "original" : song.is_original === false ? "not original" : null
          ].filter(Boolean).join(" · ")),
          active: true,
          project: song.project ? String(song.project) : null,
          origin: "vault"
        });
      }
    }
  }

  if (input.showNight != null) {
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
