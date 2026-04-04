"use client";

import { Bell, Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type NotificationItem = {
  id: string;
  title: string;
  body: string;
  kind: string;
  readAt: string | null;
  createdAt: string;
};

type ListResponse = {
  items: NotificationItem[];
  unreadCount: number;
};

export function WorkflowNotificationsStrip({ artistId }: { artistId: string }) {
  const [data, setData] = useState<ListResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await apiFetch<ListResponse>(
      `/workflow/notifications?limit=8&unreadOnly=true`,
      { artistId, cache: "no-store" }
    );
    setData(res);
  }, [artistId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await load();
      } catch (e) {
        if (!cancelled) {
          setErr(e instanceof Error ? e.message : String(e));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  async function markRead(id: string) {
    try {
      await apiFetch(`/workflow/notifications/${encodeURIComponent(id)}/read`, {
        method: "PATCH",
        artistId,
        json: {}
      });
      await load();
    } catch {
      /* ignore */
    }
  }

  if (err) {
    return null;
  }

  if (!data) {
    return (
      <div className="flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
        <Loader2 className="h-3 w-3 animate-spin" />
        Notifications…
      </div>
    );
  }

  if (data.unreadCount === 0) {
    return null;
  }

  const preview = data.items.slice(0, 4);

  return (
    <div className="flex flex-col gap-2 rounded-[var(--radius-lg)] border border-violet-500/15 bg-[var(--surface-1)]/80 px-3 py-2 text-[11px] text-[var(--text-secondary)]">
      <span className="inline-flex items-center gap-1 font-medium text-[var(--text-primary)]">
        <Bell className="h-3 w-3 text-violet-300" />
        Workflow
        <span className="rounded-full bg-violet-500/25 px-1.5 py-0.5 text-[10px] text-violet-100">
          {data.unreadCount} new
        </span>
      </span>
      {preview.length ? (
        <ul className="space-y-1.5">
          {preview.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => void markRead(n.id)}
                className="w-full rounded-md border border-transparent px-2 py-1 text-left transition hover:border-[var(--border)] hover:bg-[var(--surface-0)]"
              >
                <span className="block font-medium text-[var(--text-primary)]">
                  {n.title}
                </span>
                <span className="line-clamp-2 text-[var(--text-muted)]">
                  {n.body}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[var(--text-muted)]">
          You have unread workflow updates — refreshing…
        </p>
      )}
    </div>
  );
}
