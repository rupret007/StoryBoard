"use client";

import { useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Shield,
  Sparkles,
  Terminal
} from "lucide-react";
import { apiFetch } from "@/lib/api";

export function CommandBar({ artistId }: { artistId?: string }) {
  const [text, setText] = useState("");
  const [result, setResult] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    try {
      const data = await apiFetch<Record<string, unknown>>("/commands/execute", {
        method: "POST",
        json: { text },
        ...(artistId
          ? { headers: new Headers({ "x-artist-id": artistId }) }
          : {})
      });
      setResult(data);
    } catch (err) {
      setResult({ error: err instanceof Error ? err.message : String(err) });
    } finally {
      setLoading(false);
    }
  }

  const parsed = result as Record<string, unknown> | null;
  const hasApproval =
    parsed &&
    typeof parsed["result"] === "object" &&
    parsed["result"] !== null &&
    "approvalId" in (parsed["result"] as object);
  const hasError = parsed && "error" in parsed;
  const intent =
    parsed && typeof parsed["intent"] === "string" ? parsed["intent"] : null;
  const providerModes =
    parsed &&
    typeof parsed["providerModes"] === "object" &&
    parsed["providerModes"] !== null
      ? (parsed["providerModes"] as Record<string, string>)
      : null;

  return (
    <section
      className="rounded-[var(--radius-xl)] border border-cyan-500/20 bg-[var(--surface-1)]/95 p-4 shadow-[0_0_40px_-12px_rgba(34,211,238,0.35)] md:p-5"
      aria-label="StoryBoard command"
    >
      <div className="mb-3 flex items-center gap-2 text-[var(--text-primary)]">
        <Terminal className="h-4 w-4 text-[var(--accent)]" aria-hidden />
        <span className="text-sm font-semibold">Command</span>
        <span className="rounded-md bg-[var(--surface-2)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
          dry-run first
        </span>
      </div>
      <form
        className="flex flex-col gap-3 md:flex-row md:items-stretch"
        onSubmit={(e) => void run(e)}
      >
        <label className="sr-only" htmlFor="sb-command">
          StoryBoard command
        </label>
        <div className="relative flex-1">
          <Sparkles className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            id="sb-command"
            className="sb-input h-11 rounded-[var(--radius-lg)] pl-10"
            placeholder="Try: show pending approvals · pipeline health · draft outreach for venues…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            autoComplete="off"
          />
        </div>
        <button
          type="submit"
          disabled={loading || !text.trim()}
          className="sb-btn-primary h-11 shrink-0 px-6"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Running
            </>
          ) : (
            "Run"
          )}
        </button>
      </form>
      <p className="mt-3 text-xs leading-relaxed text-[var(--text-muted)]">
        Natural language maps to intents. Use a JSON{" "}
        <code className="rounded bg-[var(--surface-0)] px-1 py-0.5 text-[var(--text-secondary)]">
          intent
        </code>{" "}
        on{" "}
        <code className="rounded bg-[var(--surface-0)] px-1 py-0.5 text-[var(--text-secondary)]">
          POST /commands/execute
        </code>{" "}
        for stable routing. Risky flows create{" "}
        <span className="font-medium text-[var(--secondary)]">approval</span>{" "}
        rows — nothing sends silently.
      </p>

      {result !== null ? (
        <div className="mt-4 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {hasError ? (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-red-300">
                <AlertCircle className="h-3.5 w-3.5" /> Error
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-300">
                <CheckCircle2 className="h-3.5 w-3.5" /> Completed
              </span>
            )}
            {intent ? (
              <span className="rounded-md bg-[var(--surface-2)] px-2 py-0.5 font-mono text-[11px] text-[var(--accent)]">
                {intent}
              </span>
            ) : null}
            {hasApproval ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-[var(--secondary-muted)] px-2 py-0.5 text-[11px] font-medium text-violet-200">
                <Shield className="h-3 w-3" />
                Routed to approvals
              </span>
            ) : null}
            {providerModes ? (
              <span className="rounded-md bg-[var(--surface-0)] px-2 py-0.5 font-mono text-[10px] text-[var(--text-muted)]">
                gmail:{providerModes["gmail"]} · cal:{providerModes["calendar"]} ·
                drive:{providerModes["drive"]} · bit:{providerModes["bandsintown"]}{" "}
                · tm:{providerModes["ticketmaster"]}
              </span>
            ) : null}
          </div>
          <pre className="max-h-72 overflow-auto rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-0)] p-4 text-xs leading-relaxed text-[var(--text-secondary)] whitespace-pre-wrap break-words">
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      ) : null}
    </section>
  );
}
