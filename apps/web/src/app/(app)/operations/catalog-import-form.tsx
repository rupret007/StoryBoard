"use client";

import { SurfaceCard } from "@storyboard/ui";
import { parseLocalCatalogJson } from "@storyboard/shared";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "@/lib/api";
import type { CatalogImportResult } from "@/lib/types";

export function CatalogImportForm() {
  const router = useRouter();
  const [vaultText, setVaultText] = useState("");
  const [showNightText, setShowNightText] = useState("");
  const [preview, setPreview] = useState<CatalogImportResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function updateVault(value: string) {
    setVaultText(value);
    setPreview(null);
  }

  function updateShowNight(value: string) {
    setShowNightText(value);
    setPreview(null);
  }

  async function readLocalFile(file: File | undefined, apply: (value: string) => void) {
    if (!file) return;
    apply(await file.text());
  }

  async function submit(dryRun: boolean) {
    setBusy(true);
    setError("");
    try {
      const vault = parseLocalCatalogJson(vaultText, "Vault");
      const showNight = parseLocalCatalogJson(showNightText, "Show Night");
      if (vault == null && showNight == null) {
        throw new Error("Provide a local Vault app_api.json / master_catalog.json and/or a Show Night show.json");
      }
      const result = await apiFetch<CatalogImportResult>("/songs/import", {
        method: "POST",
        json: { vault, showNight, dryRun }
      });
      setPreview(result);
      if (!dryRun) router.refresh();
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
        Vault is the catalog brain. Choose or paste a <strong>local</strong> JSON file — StoryBoard will not fetch a URL, auto-post, or invent a fourth live band. Travis books. Preview first; apply writes songs and setlists onto this artist only. Parked catalogs and guest sets stay out unless you use the CLI flags.
      </p>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <label>
          <span className="sb-label">Vault JSON (app_api.json or master_catalog.json)</span>
          <input
            aria-label="Local Vault catalog file"
            className="sb-input mt-1.5"
            type="file"
            accept=".json,application/json"
            onChange={(event) => void readLocalFile(event.target.files?.[0], updateVault)}
          />
          <textarea
            aria-label="Vault JSON"
            className="sb-input mt-2 min-h-28 font-mono text-xs"
            value={vaultText}
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
            onChange={(event) => void readLocalFile(event.target.files?.[0], updateShowNight)}
          />
          <textarea
            aria-label="Show Night JSON"
            className="sb-input mt-2 min-h-28 font-mono text-xs"
            value={showNightText}
            onChange={(event) => updateShowNight(event.target.value)}
            placeholder='{"radDadSet":[]}'
          />
        </label>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className="sb-btn-primary" disabled={busy} onClick={() => void submit(true)}>
          Preview import
        </button>
        <button type="button" className="sb-btn-secondary" disabled={busy || preview?.dryRun !== true} onClick={() => void submit(false)}>
          Apply import
        </button>
      </div>
      {error ? <p className="mt-3 text-sm text-red-300" role="alert">{error}</p> : null}
      {preview ? (
        <div className="mt-4 rounded-lg bg-[var(--surface-subtle)] p-3 text-sm" role="status">
          <p>
            {preview.dryRun ? "Dry-run" : "Applied"}: would create {preview.reconciliation.createSongs.length} song{preview.reconciliation.createSongs.length === 1 ? "" : "s"} and {preview.reconciliation.createSetlists.length} setlist{preview.reconciliation.createSetlists.length === 1 ? "" : "s"}
            {preview.dryRun ? ". Existing titles and source keys stay skipped." : `. Wrote ${preview.created.songs} song${preview.created.songs === 1 ? "" : "s"} and ${preview.created.setlists} setlist${preview.created.setlists === 1 ? "" : "s"}.`}
          </p>
          {preview.plan.setlists.length ? (
            <ul className="mt-2 list-disc pl-5 text-[var(--text-secondary)]">
              {preview.plan.setlists.map((setlist) => (
                <li key={setlist.name}>{setlist.name} — {setlist.items.length} item{setlist.items.length === 1 ? "" : "s"}</li>
              ))}
            </ul>
          ) : <p className="mt-2 text-[var(--text-muted)]">No setlist is planned from this payload.</p>}
          {preview.plan.warnings.length ? <p className="mt-2 text-xs text-[var(--text-muted)]">{preview.plan.warnings.join(" ")}</p> : null}
        </div>
      ) : null}
    </SurfaceCard>
  );
}
