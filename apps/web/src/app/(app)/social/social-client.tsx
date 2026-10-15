"use client";

import { Badge, EmptyState, SurfaceCard } from "@storyboard/ui";
import { Check, Link2, Megaphone, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { publicApiBaseUrl, scopedApiFetch } from "@/lib/api";

export type SocialTarget = {
  id: string;
  platform: "facebook" | "instagram" | "youtube" | "tiktok";
  enabled: boolean;
  caption: string;
  title: string | null;
  tags: string[];
  includeFacebookEvent: boolean;
  facebookEventName: string | null;
  status: string;
  externalPostId: string | null;
  externalPostUrl: string | null;
  isDraftOnly: boolean;
  lastError: string | null;
};

export type SocialPost = {
  id: string;
  note: string;
  voiceKey: string;
  status: string;
  approvalRequestId: string | null;
  createdAt: string;
  media: { publicUrl: string; kind: string; filename: string } | null;
  targets: SocialTarget[];
  sendLogs: Array<{
    id: string;
    platform: string;
    outcome: string;
    externalPostId: string | null;
    errorMessage: string | null;
    attemptedAt: string;
    adapterMode: string;
  }>;
  approval?: {
    id: string;
    status: string;
    approvedAt: string | null;
    approvedBy: string | null;
    actionType: string;
  } | null;
};

export type SocialWorkspace = {
  artist: { id: string; name: string };
  voiceKey: string;
  adapterMode: "mock" | "real";
  connect: { meta: boolean; youtube_publish: boolean; tiktok: boolean };
  accounts: Array<{
    platform: string;
    accountLabel: string;
    externalAccountId: string;
    voiceKey: string;
    status: string;
    handle: string | null;
  }>;
  connections: Array<{ provider: string; status: string; accountLabel: string | null }>;
  events: Array<{ id: string; title: string; startsAt: string | null; locationName: string | null }>;
  posts: SocialPost[];
};

const PLATFORM_LABEL: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  youtube: "YouTube",
  tiktok: "TikTok"
};

export function SocialClient({
  artistId,
  canManage,
  isOwner,
  initial
}: {
  artistId: string | null;
  canManage: boolean;
  isOwner: boolean;
  initial: SocialWorkspace | null;
}) {
  const apiFetch = scopedApiFetch(artistId);
  const [workspace, setWorkspace] = useState(initial);
  const [note, setNote] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [mediaKind, setMediaKind] = useState<"photo" | "video">("photo");
  const [eventId, setEventId] = useState("");
  const [busy, setBusy] = useState<"drop" | "post" | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [activePost, setActivePost] = useState<SocialPost | null>(initial?.posts[0] ?? null);
  const [drafts, setDrafts] = useState<SocialTarget[]>(initial?.posts[0]?.targets ?? []);

  const voiceLabel = useMemo(() => {
    if (workspace?.voiceKey === "stalemate") return "Stalemate";
    if (workspace?.voiceKey === "rad_dad") return "Rad Dad";
    return "Unknown — will not inherit Stalemate or Rad Dad";
  }, [workspace?.voiceKey]);

  async function refresh(preferredPostId?: string) {
    if (!artistId) return;
    const next = await apiFetch<SocialWorkspace>("/social");
    setWorkspace(next);
    const selectedId = preferredPostId ?? activePost?.id;
    if (!selectedId) return;
    const match = next.posts.find((row) => row.id === selectedId);
    if (match) {
      setActivePost(match);
      setDrafts(match.targets);
    }
  }

  async function drop() {
    if (!canManage) return;
    setBusy("drop");
    setError("");
    setNotice("");
    try {
      const created = await apiFetch<SocialPost>("/social/drops", {
        method: "POST",
        json: {
          note,
          mediaUrl: mediaUrl.trim() || undefined,
          mediaKind,
          eventId: eventId || undefined
        }
      });
      setActivePost(created);
      setDrafts(created.targets);
      setNotice("Drafts ready. Review each platform, then approve once. Nothing has posted.");
      await refresh(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The drop could not be drafted.");
    } finally {
      setBusy(null);
    }
  }

  async function approveAndPost() {
    if (!canManage || !activePost) return;
    setBusy("post");
    setError("");
    setNotice("");
    try {
      const posted = await apiFetch<SocialPost>("/social/approve-and-post", {
        method: "POST",
        json: {
          postId: activePost.id,
          targets: drafts.map((row) => ({
            id: row.id,
            enabled: row.enabled,
            caption: row.caption,
            title: row.title ?? undefined,
            tags: row.tags,
            includeFacebookEvent: row.includeFacebookEvent
          }))
        }
      });
      setActivePost(posted);
      setDrafts(posted.targets);
      const missing = posted.targets.filter((row) => row.enabled && !row.externalPostId);
      setNotice(
        missing.length
          ? "Approval was recorded. Platforms without an ID were not marked posted."
          : posted.targets.some((row) => row.isDraftOnly)
            ? "Approval recorded. TikTok is an inbox draft until you finish it in the TikTok app."
            : "Approval recorded. Each live platform returned an ID."
      );
      await refresh(posted.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Approve & post failed. Nothing extra was sent.");
    } finally {
      setBusy(null);
    }
  }

  function connectHref(provider: "meta" | "youtube_publish" | "tiktok") {
    if (!artistId) return "#";
    return `${publicApiBaseUrl()}/social/connect/${provider}/start?artistId=${encodeURIComponent(artistId)}`;
  }

  if (!workspace || !artistId) {
    return (
      <EmptyState
        title="Social is unavailable"
        description="Your band could not be verified. Reload before drafting or approving a post."
      />
    );
  }

  return (
    <div className="space-y-6">
      <SurfaceCard>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="sb-kicker">Voice</p>
            <h2 className="mt-2 text-xl font-semibold text-[var(--text-primary)]">{workspace.artist.name}</h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">{voiceLabel}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge>{workspace.adapterMode === "mock" ? "Mock adapters" : "Real adapters"}</Badge>
            <Badge>{workspace.voiceKey}</Badge>
          </div>
        </div>
        <p className="mt-4 text-sm text-[var(--text-secondary)]">
          Stalemate and Rad Dad stay on separate voice profiles. An account check runs before every send.
          Manager chat still will not publish.
        </p>
      </SurfaceCard>

      <SurfaceCard>
        <div className="flex items-center gap-2">
          <Link2 className="h-4 w-4 text-[var(--accent)]" />
          <h3 className="text-base font-semibold">Connect accounts</h3>
        </div>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          Owner-only OAuth. Tokens are stored encrypted server-side or read from env vars. Nothing is committed.
        </p>
        <dl className="mt-4 grid gap-3 sm:grid-cols-3">
          {[
            { provider: "meta" as const, label: "Facebook / Instagram", ready: workspace.connect.meta },
            { provider: "youtube_publish" as const, label: "YouTube upload", ready: workspace.connect.youtube_publish },
            { provider: "tiktok" as const, label: "TikTok inbox draft", ready: workspace.connect.tiktok }
          ].map((row) => (
            <div key={row.provider} className="rounded-lg border border-[var(--border)] bg-[var(--surface-0)] p-3">
              <dt className="text-sm font-medium">{row.label}</dt>
              <dd className="mt-1 text-xs text-[var(--text-muted)]">
                {row.ready ? "App credentials are configured." : "Needs app credentials in env."}
              </dd>
              {isOwner ? (
                <a className="sb-btn-secondary mt-3 inline-flex min-h-11 items-center px-3 text-sm" href={connectHref(row.provider)}>
                  Connect
                </a>
              ) : (
                <p className="mt-3 text-xs text-[var(--text-muted)]">Owner only</p>
              )}
            </div>
          ))}
        </dl>
        {workspace.accounts.length ? (
          <ul className="mt-4 space-y-1 text-sm text-[var(--text-secondary)]">
            {workspace.accounts.map((account) => (
              <li key={`${account.platform}-${account.externalAccountId}`}>
                {PLATFORM_LABEL[account.platform] ?? account.platform}: {account.accountLabel} ({account.voiceKey})
              </li>
            ))}
          </ul>
        ) : null}
      </SurfaceCard>

      <SurfaceCard>
        <div className="flex items-center gap-2">
          <Megaphone className="h-4 w-4 text-[var(--accent)]" />
          <h3 className="text-base font-semibold">Drop media and a note</h3>
        </div>
        <div className="mt-4 grid gap-4">
          <label className="block text-sm">
            <span className="text-[var(--text-secondary)]">Note</span>
            <textarea
              className="sb-input mt-1 min-h-28"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Manic live at Burlington, Friday"
              disabled={!canManage}
            />
          </label>
          <label className="block text-sm">
            <span className="text-[var(--text-secondary)]">Public https media URL</span>
            <input
              className="sb-input mt-1"
              value={mediaUrl}
              onChange={(event) => setMediaUrl(event.target.value)}
              placeholder="https://…"
              disabled={!canManage}
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="text-[var(--text-secondary)]">Media kind</span>
              <select
                className="sb-select mt-1"
                value={mediaKind}
                onChange={(event) => setMediaKind(event.target.value as "photo" | "video")}
                disabled={!canManage}
              >
                <option value="photo">Photo / feed</option>
                <option value="video">Video / Reel</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-[var(--text-secondary)]">Show (Facebook Event)</span>
              <select
                className="sb-select mt-1"
                value={eventId}
                onChange={(event) => setEventId(event.target.value)}
                disabled={!canManage}
              >
                <option value="">No linked show</option>
                {workspace.events.map((event) => (
                  <option key={event.id} value={event.id}>
                    {event.title}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button
            type="button"
            className="sb-btn-primary min-h-11 px-4 text-sm font-medium"
            onClick={() => void drop()}
            disabled={!canManage || !note.trim() || busy !== null}
          >
            {busy === "drop" ? "Drafting…" : "Draft captions"}
          </button>
        </div>
      </SurfaceCard>

      {activePost ? (
        <SurfaceCard elevated>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="sb-kicker">Approve once</p>
              <h3 className="mt-2 text-lg font-semibold">Per-platform preview</h3>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                Approval {activePost.approval?.status ?? "pending"}
                {activePost.approvalRequestId ? ` · ${activePost.approvalRequestId}` : ""}
                {" · "}
                {activePost.status}
              </p>
            </div>
            <button
              type="button"
              className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[var(--accent)] px-4 text-sm font-semibold text-slate-950"
              onClick={() => void approveAndPost()}
              disabled={!canManage || busy !== null}
              data-testid="social-approve-and-post"
            >
              <ShieldCheck className="h-4 w-4" />
              {busy === "post" ? "Posting…" : "Approve & post"}
            </button>
          </div>
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {drafts.map((target, index) => (
              <article key={target.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface-0)] p-4">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="font-semibold">{PLATFORM_LABEL[target.platform]}</h4>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={target.enabled}
                      onChange={(event) => {
                        const next = [...drafts];
                        next[index] = { ...target, enabled: event.target.checked };
                        setDrafts(next);
                      }}
                      disabled={!canManage}
                    />
                    On
                  </label>
                </div>
                {target.platform === "youtube" ? (
                  <input
                    className="sb-input mt-3"
                    value={target.title ?? ""}
                    onChange={(event) => {
                      const next = [...drafts];
                      next[index] = { ...target, title: event.target.value };
                      setDrafts(next);
                    }}
                    disabled={!canManage}
                    aria-label="YouTube title"
                  />
                ) : null}
                <textarea
                  className="sb-input mt-3 min-h-32"
                  value={target.caption}
                  onChange={(event) => {
                    const next = [...drafts];
                    next[index] = { ...target, caption: event.target.value };
                    setDrafts(next);
                  }}
                  disabled={!canManage}
                  aria-label={`${PLATFORM_LABEL[target.platform]} caption`}
                />
                {target.platform === "facebook" ? (
                  <label className="mt-3 flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                    <input
                      type="checkbox"
                      checked={target.includeFacebookEvent}
                      onChange={(event) => {
                        const next = [...drafts];
                        next[index] = { ...target, includeFacebookEvent: event.target.checked };
                        setDrafts(next);
                      }}
                      disabled={!canManage}
                    />
                    Create Facebook Event
                  </label>
                ) : null}
                {target.platform === "tiktok" ? (
                  <p className="mt-3 text-xs text-[var(--text-muted)]">
                    TikTok sends an inbox draft. Finish it in the TikTok app.
                  </p>
                ) : null}
                {target.externalPostId ? (
                  <p className="mt-3 flex items-center gap-1 text-xs text-emerald-300">
                    <Check className="h-3 w-3" />
                    {target.isDraftOnly ? "Draft ID" : "Posted ID"}: {target.externalPostId}
                  </p>
                ) : null}
                {target.lastError ? (
                  <p className="mt-3 text-xs text-rose-200">{target.lastError}</p>
                ) : null}
              </article>
            ))}
          </div>
        </SurfaceCard>
      ) : (
        <EmptyState
          title="No drop in review"
          description="Write a note, optionally add a public media URL and a show, then draft captions."
        />
      )}

      {notice ? (
        <p role="status" className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 p-3 text-sm text-cyan-100">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-100">
          {error}
        </p>
      ) : null}

      <SurfaceCard>
        <h3 className="text-base font-semibold">Recent sends</h3>
        {workspace.posts.length === 0 ? (
          <p className="mt-2 text-sm text-[var(--text-secondary)]">No send logs yet.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {workspace.posts.map((post) => (
              <li key={post.id} className="rounded-lg border border-[var(--border)] bg-[var(--surface-0)] p-3">
                <button
                  type="button"
                  className="text-left text-sm font-medium"
                  onClick={() => {
                    setActivePost(post);
                    setDrafts(post.targets);
                  }}
                >
                  {post.note}
                </button>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  {post.status} · {post.voiceKey} · {post.targets.filter((row) => row.externalPostId).length} platform IDs
                </p>
                {post.sendLogs.length ? (
                  <ul className="mt-2 space-y-1 text-xs text-[var(--text-secondary)]">
                    {post.sendLogs.slice(0, 6).map((log) => (
                      <li key={log.id}>
                        {PLATFORM_LABEL[log.platform] ?? log.platform}: {log.outcome}
                        {log.externalPostId ? ` · ${log.externalPostId}` : ""}
                        {log.errorMessage ? ` · ${log.errorMessage}` : ""}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </SurfaceCard>
    </div>
  );
}
