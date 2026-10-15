"use client";

import { Badge, EmptyState, SurfaceCard } from "@storyboard/ui";
import { Check, Link2, Megaphone, ShieldCheck, Upload } from "lucide-react";
import { useMemo, useRef, useState } from "react";
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
  const [mediaAssetId, setMediaAssetId] = useState<string | null>(null);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [localFileName, setLocalFileName] = useState("");
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [eventId, setEventId] = useState("");
  const [busy, setBusy] = useState<"drop" | "post" | "upload" | null>(null);
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

  async function uploadFile(file: File) {
    if (!canManage) return;
    setBusy("upload");
    setError("");
    setNotice("");
    setMediaAssetId(null);
    if (localPreview) URL.revokeObjectURL(localPreview);
    const preview = URL.createObjectURL(file);
    setLocalPreview(preview);
    setLocalFileName(file.name);
    setMediaKind(file.type.startsWith("video/") || /\.(mp4|mov|m4v|webm)$/i.test(file.name) ? "video" : "photo");
    setUploadProgress(0);
    try {
      const init = await apiFetch<{
        id: string;
        chunkSize: number;
        byteSize: number;
      }>("/social/media", {
        method: "POST",
        json: {
          filename: file.name,
          mimeType: file.type || (file.name.endsWith(".mov") ? "video/quicktime" : "application/octet-stream"),
          byteSize: file.size
        }
      });
      let offset = 0;
      while (offset < file.size) {
        const end = Math.min(offset + init.chunkSize, file.size);
        const buf = await file.slice(offset, end).arrayBuffer();
        const next = await apiFetch<{ receivedBytes: number }>("/social/media/" + init.id + "/chunks", {
          method: "PUT",
          headers: {
            "Content-Type": "application/octet-stream",
            "Content-Range": `bytes ${offset}-${end - 1}/${file.size}`
          },
          body: buf
        });
        offset = next.receivedBytes;
        setUploadProgress(Math.round((offset / file.size) * 100));
      }
      const done = await apiFetch<{ id: string; ready: boolean }>("/social/media/" + init.id + "/complete", {
        method: "POST"
      });
      setMediaAssetId(done.id);
      setUploadProgress(100);
      setNotice("File is stored on the server. Add a note, then draft captions. Nothing has posted.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "The file could not be stored.");
      setMediaAssetId(null);
      setUploadProgress(null);
    } finally {
      setBusy(null);
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
          mediaAssetId: mediaAssetId || undefined,
          mediaUrl: mediaAssetId ? undefined : mediaUrl.trim() || undefined,
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
          <div>
            <span className="text-sm text-[var(--text-secondary)]">Photo or video</span>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*,video/mp4,video/quicktime,video/webm"
              className="sr-only"
              data-testid="social-file-input"
              disabled={!canManage || busy !== null}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void uploadFile(file);
                event.target.value = "";
              }}
            />
            <button
              type="button"
              data-testid="social-file-dropzone"
              className={`mt-1 flex min-h-32 w-full flex-col items-center justify-center rounded-xl border border-dashed px-4 py-6 text-center ${
                dragging
                  ? "border-[var(--accent)] bg-cyan-500/10"
                  : "border-[var(--border)] bg-[var(--surface-0)]"
              }`}
              disabled={!canManage || busy !== null}
              onClick={() => fileInputRef.current?.click()}
              onDragEnter={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                const file = event.dataTransfer.files?.[0];
                if (file) void uploadFile(file);
              }}
            >
              <Upload className="h-5 w-5 text-[var(--accent)]" />
              <p className="mt-2 text-sm font-medium">Drop a photo or video, or tap to choose one</p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                Works from a phone camera roll. Videos up to 2 GB upload in chunks with progress.
              </p>
            </button>
            {uploadProgress !== null ? (
              <div className="mt-3" data-testid="social-upload-progress">
                <div className="h-2 overflow-hidden rounded-full bg-[var(--surface-2)]">
                  <div
                    className="h-full bg-[var(--accent)]"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">
                  {uploadProgress < 100 ? `Uploading ${uploadProgress}%` : `Stored ${localFileName}`}
                </p>
              </div>
            ) : null}
            {localPreview && mediaKind === "photo" ? (
              <img src={localPreview} alt="" className="mt-3 max-h-48 rounded-lg border border-[var(--border)] object-contain" />
            ) : null}
            {localPreview && mediaKind === "video" ? (
              <video src={localPreview} controls className="mt-3 max-h-48 w-full rounded-lg border border-[var(--border)]" />
            ) : null}
            <label className="mt-4 block text-sm">
              <span className="text-[var(--text-secondary)]">Optional public https URL</span>
              <input
                className="sb-input mt-1"
                value={mediaUrl}
                onChange={(event) => setMediaUrl(event.target.value)}
                placeholder="Only if the file already lives on the web"
                disabled={!canManage || Boolean(mediaAssetId)}
              />
            </label>
          </div>
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
            disabled={!canManage || !note.trim() || busy !== null || (uploadProgress !== null && uploadProgress < 100)}
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
          description="Write a note, drop a photo or video (or paste a public https URL), then draft captions."
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
