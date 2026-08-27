"use client";

import { SurfaceCard } from "@storyboard/ui";
import { describeCatalogImportPreview, parseLocalCatalogJson } from "@storyboard/shared";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "@/lib/api";
import type { CatalogImportResult } from "@/lib/types";

type PreviewPayload = { vault?: unknown; showNight?: unknown };

export function CatalogImportForm() {
  const router = useRouter();
  const [vaultText, setVaultText] = useState("");
  const [showNightText, setShowNightText] = useState("");
  const [preview, setPreview] = useState<CatalogImportResult | null>(null);
  const [previewPayload, setPreviewPayload] = useState<PreviewPayload | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const review = preview ? describeCatalogImportPreview(preview) : null;

  function updateVault(value: string) {
    setVaultText(value);
    setPreview(null);
    setPreviewPayload(null);
  }

  function updateShowNight(value: string) {
    setShowNightText(value);
    setPreview(null);
    setPreviewPayload(null);
  }

  async function readLocalFile(file: File | undefined, apply: (value: string) => void) {
    if (!file) return;
    apply(await file.text());
  }

  function parsePayload(): PreviewPayload {
    const vault = parseLocalCatalogJson(vaultText, "Vault");
    const showNight = parseLocalCatalogJson(showNightText, "Show Night");
    if (vault == null && showNight == null) {
      throw new Error("Provide a local Vault data/app_api.json feed and/or a Show Night show.json");
    }
    return {
      ...(vault !== undefined ? { vault } : {}),
      ...(showNight !== undefined ? { showNight } : {})
    };
  }

  async function submit(dryRun: boolean) {
    setBusy(true);
    setError("");
    try {
      const payload = dryRun ? parsePayload() : previewPayload;
      if (!payload || (payload.vault == null && payload.showNight == null)) {
        throw new Error("Preview this local JSON before applying");
      }
      const result = await apiFetch<CatalogImportResult>("/songs/import", {
        method: "POST",
        json: { ...payload, dryRun }
      });
      setPreview(result);
      if (dryRun) setPreviewPayload(payload);
      else {
        setPreviewPayload(null);
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SurfaceCard>
      <h2 className="font-semibold">Import catalog</h2>
      <p className="mt-1 text-sm text-[var(--text-muted)]">
        Vault is the catalog brain. Choose or paste its <strong>local data/app_api.json feed</strong>, not the master catalog spine — StoryBoard will not fetch a URL, auto-post, or invent a fourth live band. Travis books. Preview first; apply writes the reviewed songs and setlists onto this artist only. Parked catalogs and guest sets stay out unless you use the CLI flags.
      </p>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <label>
          <span className="sb-label">Vault StoryBoard feed (data/app_api.json)</span>
          <input
            aria-label="Local Vault catalog file"
            className="sb-input mt-1.5"
            type="file"
            accept=".json,application/json"
            disabled={busy}
            onChange={(event) => void readLocalFile(event.target.files?.[0], updateVault)}
          />
          <textarea
            aria-label="Vault JSON"
            className="sb-input mt-2 min-h-28 font-mono text-xs"
            value={vaultText}
            disabled={busy}
            onChange={(event) => updateVault(event.target.value)}
            placeholder='{"schema_version":3,"songs":[],"setlist_ready_default_import":[]}'
          />
        </label>
        <label>
          <span className="sb-label">Show Night JSON (optional running order)</span>
          <input
            aria-label="Local Show Night file"
            className="sb-input mt-1.5"
            type="file"
            accept=".json,application/json"
            disabled={busy}
            onChange={(event) => void readLocalFile(event.target.files?.[0], updateShowNight)}
          />
          <textarea
            aria-label="Show Night JSON"
            className="sb-input mt-2 min-h-28 font-mono text-xs"
            value={showNightText}
            disabled={busy}
            onChange={(event) => updateShowNight(event.target.value)}
            placeholder='{"radDadSet":[]}'
          />
        </label>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className="sb-btn-primary" disabled={busy} onClick={() => void submit(true)}>
          Preview import
        </button>
        <button type="button" className="sb-btn-secondary" disabled={busy || !previewPayload || preview?.dryRun !== true} onClick={() => void submit(false)}>
          Apply import
        </button>
      </div>
      {error ? <p className="mt-3 text-sm text-red-300" role="alert">{error}</p> : null}
      {review ? (
        <div className="mt-4 rounded-lg bg-[var(--surface-subtle)] p-3 text-sm" role="status">
          <p>{review.headline}</p>
          {review.songTitles.length ? (
            <ul className="mt-2 list-disc pl-5 text-[var(--text-secondary)]">
              {review.songTitles.map((title) => <li key={title}>{title}</li>)}
            </ul>
          ) : <p className="mt-2 text-[var(--text-muted)]">No songs are planned from this payload.</p>}
          {review.moreSongCount ? <p className="mt-1 text-xs text-[var(--text-muted)]">+{review.moreSongCount} more planned song{review.moreSongCount === 1 ? "" : "s"}.</p> : null}
          {review.setlists.length ? (
            <ul className="mt-2 list-disc pl-5 text-[var(--text-secondary)]">
              {review.setlists.map((setlist) => (
                <li key={setlist.name}>{setlist.name} — {setlist.itemCount} item{setlist.itemCount === 1 ? "" : "s"}</li>
              ))}
            </ul>
          ) : <p className="mt-2 text-[var(--text-muted)]">No setlist is planned from this payload.</p>}
          {review.skipLines.length ? (
            <ul className="mt-2 space-y-1 text-xs text-[var(--text-muted)]">
              {review.skipLines.map((line) => <li key={line}>{line}</li>)}
            </ul>
          ) : null}
          {review.existingSkipLine ? <p className="mt-2 text-xs text-[var(--text-muted)]">{review.existingSkipLine}</p> : null}
          {review.warnings.length ? <p className="mt-2 text-xs text-[var(--text-muted)]">{review.warnings.join(" ")}</p> : null}
        </div>
      ) : null}
    </SurfaceCard>
  );
}
