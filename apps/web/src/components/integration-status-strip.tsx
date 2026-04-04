"use client";

import { useEffect, useState } from "react";
import { Link2, Loader2 } from "lucide-react";
import { apiBaseUrl, apiFetch } from "@/lib/api";

type StatusResponse = {
  artistId: string;
  providers: Record<string, string>;
  googleConnection: {
    status: string;
    scopes: string[];
    accountLabel: string | null;
    hasEncryptedSecrets: boolean;
  };
  envHints: Record<string, boolean>;
};

export function IntegrationStatusStrip({ artistId }: { artistId: string }) {
  const [data, setData] = useState<StatusResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch<StatusResponse>(
          `/integrations/status?artistId=${encodeURIComponent(artistId)}`,
          { cache: "no-store" }
        );
        if (!cancelled) {
          setData(res);
        }
      } catch (e) {
        if (!cancelled) {
          setErr(e instanceof Error ? e.message : String(e));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [artistId]);

  const connectHref = `${apiBaseUrl()}/integrations/google/authorize?artistId=${encodeURIComponent(artistId)}`;

  if (err) {
    return (
      <p className="text-[11px] text-[var(--text-muted)]">
        Integrations status unavailable.
      </p>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
        <Loader2 className="h-3 w-3 animate-spin" />
        Loading integrations…
      </div>
    );
  }

  const gc = data.googleConnection;
  const gConnected =
    gc.status === "active" && gc.hasEncryptedSecrets;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[var(--radius-lg)] border border-cyan-500/15 bg-[var(--surface-1)]/80 px-3 py-2 text-[11px] text-[var(--text-secondary)]">
      <span className="inline-flex items-center gap-1 font-medium text-[var(--text-primary)]">
        <Link2 className="h-3 w-3 text-[var(--accent)]" />
        Integrations
      </span>
      <span className="font-mono text-[var(--text-muted)]">
        gmail:{data.providers["gmail"]} · cal:{data.providers["calendar"]} ·
        drive:{data.providers["drive"]}
      </span>
      <span className="text-[var(--text-muted)]">
        Google: {gConnected ? "connected" : "not connected"}
        {gConnected && gc.scopes.length ? ` · ${gc.scopes.length} scopes` : ""}
      </span>
      {!gConnected ? (
        <a
          href={connectHref}
          className="rounded-md border border-cyan-500/30 px-2 py-0.5 font-medium text-cyan-200 transition hover:border-cyan-400/50 hover:text-cyan-100"
        >
          Connect Google
        </a>
      ) : null}
    </div>
  );
}
