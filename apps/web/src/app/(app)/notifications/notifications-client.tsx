"use client";

import { PageHeader, SurfaceCard } from "@storyboard/ui";
import type {
  TelegramNotifyCategories,
  WorkflowNotifyPrefs
} from "@storyboard/shared";
import { Bell, Copy, ExternalLink, Loader2, Save, Send } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { apiFetch, ApiHttpError } from "@/lib/api";

type Escalation = {
  workflowOverdueGraceDays: number | null;
  workflowStaleFollowupDays: number | null;
  workflowPendingApprovalDays: number | null;
};

type TelegramReadiness = {
  botConfigured: boolean;
  urgentEnabled: boolean;
  hasChatId: boolean;
  canSend: boolean;
};

type TelegramApiResponse =
  | {
      redacted: true;
      readiness: TelegramReadiness;
      note: string;
    }
  | {
      redacted: false;
      readiness: TelegramReadiness;
      telegramUrgentEnabled: boolean;
      telegramChatId: string | null;
      telegramNotifyCategories: TelegramNotifyCategories;
    };

const categoryLabels: {
  key: keyof Omit<WorkflowNotifyPrefs, "digest">;
  label: string;
}[] = [
  { key: "invites", label: "Invites" },
  { key: "approvals", label: "Approvals" },
  { key: "overdueTasks", label: "Overdue tasks" },
  { key: "staleFollowUps", label: "Stale follow-ups" },
  { key: "integrationChanges", label: "Integration changes" }
];

export function NotificationsClient({
  artistId,
  isOwner
}: {
  artistId: string;
  isOwner: boolean;
}) {
  const [prefs, setPrefs] = useState<WorkflowNotifyPrefs | null>(null);
  const [escalation, setEscalation] = useState<Escalation | null>(null);
  const [lastDigestLabel, setLastDigestLabel] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [savingEsc, setSavingEsc] = useState(false);
  const [telegram, setTelegram] = useState<TelegramApiResponse | null>(null);
  const [telegramDraft, setTelegramDraft] = useState<{
    telegramUrgentEnabled: boolean;
    telegramChatId: string;
    telegramNotifyCategories: TelegramNotifyCategories;
  } | null>(null);
  const [savingTg, setSavingTg] = useState(false);
  const [telegramRegistration, setTelegramRegistration] = useState<{
    startPayload: string;
    deepLink: string | null;
    expiresAt: string;
  } | null>(null);
  const [creatingRegistration, setCreatingRegistration] = useState(false);
  const [copyHint, setCopyHint] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [prefRes, escRes, notifRes, tgRes] = await Promise.all([
        apiFetch<{ preferences: WorkflowNotifyPrefs }>("/workflow/preferences", {
          artistId
        }),
        apiFetch<Escalation>("/workflow/escalation", { artistId }),
        apiFetch<{
          items: { kind: string; title: string; createdAt: string }[];
        }>("/workflow/notifications?limit=20", { artistId }),
        apiFetch<TelegramApiResponse>("/workflow/telegram", { artistId })
      ]);
      setPrefs(prefRes.preferences);
      setEscalation(escRes);
      setTelegram(tgRes);
      if (tgRes.redacted === false) {
        setTelegramDraft({
          telegramUrgentEnabled: tgRes.telegramUrgentEnabled,
          telegramChatId: tgRes.telegramChatId ?? "",
          telegramNotifyCategories: { ...tgRes.telegramNotifyCategories }
        });
      } else {
        setTelegramDraft(null);
      }
      const digestItem = notifRes.items.find(
        (i) => i.kind === "digest_daily" || i.kind === "digest_weekly"
      );
      setLastDigestLabel(
        digestItem
          ? `${digestItem.kind.replace("digest_", "")} · ${new Date(digestItem.createdAt).toLocaleString()}`
          : null
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, [artistId]);

  useEffect(() => {
    void load();
  }, [load]);

  const savePrefs = async () => {
    if (!prefs) {
      return;
    }
    setSavingPrefs(true);
    setMessage(null);
    setError(null);
    try {
      const res = await apiFetch<{ preferences: WorkflowNotifyPrefs }>(
        "/workflow/preferences",
        { method: "PATCH", json: prefs, artistId }
      );
      setPrefs(res.preferences);
      setMessage("Notification preferences saved.");
    } catch (e) {
      const msg =
        e instanceof ApiHttpError ? e.message : "Could not save preferences";
      setError(msg);
    } finally {
      setSavingPrefs(false);
    }
  };

  const saveEscalation = async () => {
    if (!escalation) {
      return;
    }
    setSavingEsc(true);
    setMessage(null);
    setError(null);
    try {
      const res = await apiFetch<Escalation>("/workflow/escalation", {
        method: "PATCH",
        json: {
          workflowOverdueGraceDays: escalation.workflowOverdueGraceDays,
          workflowStaleFollowupDays: escalation.workflowStaleFollowupDays,
          workflowPendingApprovalDays: escalation.workflowPendingApprovalDays
        },
        artistId
      });
      setEscalation(res);
      setMessage("Escalation thresholds updated.");
    } catch (e) {
      const msg =
        e instanceof ApiHttpError ? e.message : "Could not save escalation";
      setError(msg);
    } finally {
      setSavingEsc(false);
    }
  };

  const saveTelegram = async () => {
    if (!telegramDraft || !isOwner) {
      return;
    }
    setSavingTg(true);
    setMessage(null);
    setError(null);
    try {
      const res = await apiFetch<TelegramApiResponse>("/workflow/telegram", {
        method: "PATCH",
        artistId,
        json: {
          telegramUrgentEnabled: telegramDraft.telegramUrgentEnabled,
          telegramChatId:
            telegramDraft.telegramChatId.trim() === ""
              ? null
              : telegramDraft.telegramChatId.trim(),
          telegramNotifyCategories: telegramDraft.telegramNotifyCategories
        }
      });
      setTelegram(res);
      if (res.redacted === false) {
        setTelegramDraft({
          telegramUrgentEnabled: res.telegramUrgentEnabled,
          telegramChatId: res.telegramChatId ?? "",
          telegramNotifyCategories: { ...res.telegramNotifyCategories }
        });
      }
      setMessage("Telegram urgent alerts updated.");
    } catch (e) {
      const msg =
        e instanceof ApiHttpError ? e.message : "Could not save Telegram settings";
      setError(msg);
    } finally {
      setSavingTg(false);
    }
  };

  const toggleChannel = (
    cat: keyof Omit<WorkflowNotifyPrefs, "digest">,
    channel: "inApp" | "email",
    value: boolean
  ) => {
    if (!prefs) {
      return;
    }
    setPrefs({
      ...prefs,
      [cat]: { ...prefs[cat], [channel]: value }
    });
  };

  if (loading || !prefs || !escalation || !telegram) {
    return (
      <div className="flex items-center gap-2 text-[var(--text-muted)]">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
        Loading notification settings…
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Notifications"
        description="Control how StoryBoard reaches you for this artist. Email stays draft-based until you send from your inbox."
      />

      {error ? (
        <SurfaceCard className="border-red-500/25 bg-red-950/20 text-sm text-red-200">
          {error}
        </SurfaceCard>
      ) : null}
      {message ? (
        <SurfaceCard className="border-emerald-500/25 bg-emerald-950/20 text-sm text-emerald-100">
          {message}
        </SurfaceCard>
      ) : null}

      <SurfaceCard elevated className="space-y-6">
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-[var(--accent)]" aria-hidden />
          <h2 className="text-base font-semibold text-[var(--text-primary)]">
            Channels by category
          </h2>
        </div>
        <p className="text-sm text-[var(--text-secondary)]">
          In-app items appear in the Workflow strip. Email creates a Gmail draft (or mock) when
          workflow email is enabled on your account.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-[var(--text-muted)]">
                <th className="pb-2 font-medium">Category</th>
                <th className="pb-2 font-medium">In-app</th>
                <th className="pb-2 font-medium">Email draft</th>
              </tr>
            </thead>
            <tbody>
              {categoryLabels.map(({ key, label }) => (
                <tr
                  key={key}
                  className="border-b border-[var(--border)] last:border-0"
                >
                  <td className="py-3 text-[var(--text-primary)]">{label}</td>
                  <td className="py-3">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-[var(--border)]"
                      checked={prefs[key].inApp}
                      onChange={(ev) =>
                        toggleChannel(key, "inApp", ev.target.checked)
                      }
                    />
                  </td>
                  <td className="py-3">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-[var(--border)]"
                      checked={prefs[key].email}
                      onChange={(ev) =>
                        toggleChannel(key, "email", ev.target.checked)
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="space-y-3 border-t border-[var(--border)] pt-6">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">
            Digests
          </h3>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--text-secondary)]">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-[var(--border)]"
              checked={prefs.digest.daily}
              onChange={(ev) =>
                setPrefs({
                  ...prefs,
                  digest: { ...prefs.digest, daily: ev.target.checked }
                })
              }
            />
            Daily summary (overdue, stale, pending approvals, recent activity)
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--text-secondary)]">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-[var(--border)]"
              checked={prefs.digest.weekly}
              onChange={(ev) =>
                setPrefs({
                  ...prefs,
                  digest: { ...prefs.digest, weekly: ev.target.checked }
                })
              }
            />
            Weekly summary (same sections; ISO week dedupe)
          </label>
          <p className="text-xs text-[var(--text-muted)]">
            Digest sections only include categories you have enabled above (in-app or email).
            {lastDigestLabel ? (
              <>
                {" "}
                Last digest in-app: <span className="text-[var(--text-secondary)]">{lastDigestLabel}</span>
              </>
            ) : (
              " No digest notifications yet for this artist."
            )}
          </p>
        </div>

        <button
          type="button"
          onClick={() => void savePrefs()}
          disabled={savingPrefs}
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-[#05080d] disabled:opacity-60"
        >
          {savingPrefs ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Save className="h-4 w-4" aria-hidden />
          )}
          Save preferences
        </button>
      </SurfaceCard>

      <SurfaceCard elevated className="space-y-4">
        <div className="flex items-center gap-2">
          <Send className="h-5 w-5 text-[var(--accent)]" aria-hidden />
          <h2 className="text-base font-semibold text-[var(--text-primary)]">
            Telegram urgent alerts
          </h2>
        </div>
        <p className="text-sm text-[var(--text-secondary)]">
          Optional outbound channel for deterministic urgent signals (approval aging
          clusters, severe overdue/stale tasks, failed executions). Requires a bot token
          on the server and a chat id configured here by an owner.
        </p>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 text-xs text-[var(--text-secondary)]">
          <span className="font-medium text-[var(--text-primary)]">Readiness: </span>
          {telegram.readiness.canSend
            ? "Ready — urgent scan can deliver (real Telegram or mock)."
            : [
                !telegram.readiness.botConfigured ? "server token missing" : null,
                !telegram.readiness.hasChatId ? "chat id missing" : null,
                !telegram.readiness.urgentEnabled ? "owner toggle off" : null
              ]
                .filter(Boolean)
                .join(" · ") || "Not configured"}
        </div>
        {telegram.redacted ? (
          <p className="text-sm text-[var(--text-muted)]">{telegram.note}</p>
        ) : telegramDraft ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-4 space-y-3">
              <p className="text-sm text-[var(--text-secondary)]">
                <span className="font-medium text-[var(--text-primary)]">
                  Link via Telegram
                </span>{" "}
                — generate a short-lived link, open it in Telegram, and send the
                pending <code className="text-xs text-[var(--accent)]">/start</code> so
                StoryBoard records this chat. Manual chat id below still works as a
                fallback.
              </p>
              {isOwner ? (
                <>
                  <button
                    type="button"
                    onClick={() => void (async () => {
                      setCreatingRegistration(true);
                      setError(null);
                      setCopyHint(null);
                      try {
                        const res = await apiFetch<{
                          startPayload: string;
                          deepLink: string | null;
                          expiresAt: string;
                        }>("/workflow/telegram/registration-token", {
                          method: "POST",
                          artistId
                        });
                        setTelegramRegistration(res);
                        setMessage("Registration link created — open it in Telegram before it expires.");
                      } catch (e) {
                        setError(
                          e instanceof Error ? e.message : "Could not create registration link"
                        );
                        setTelegramRegistration(null);
                      } finally {
                        setCreatingRegistration(false);
                      }
                    })()}
                    disabled={creatingRegistration}
                    className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-strong)] bg-[var(--surface-2)] px-4 py-2.5 text-sm font-semibold text-[var(--text-primary)] disabled:opacity-60"
                  >
                    {creatingRegistration ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <Send className="h-4 w-4" aria-hidden />
                    )}
                    Generate Telegram link
                  </button>
                  {telegramRegistration ? (
                    <div className="space-y-2 text-xs text-[var(--text-muted)]">
                      <p>
                        Expires{" "}
                        <span className="text-[var(--text-secondary)]">
                          {new Date(telegramRegistration.expiresAt).toLocaleString()}
                        </span>
                        .
                      </p>
                      {telegramRegistration.deepLink ? (
                        <a
                          href={telegramRegistration.deepLink}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 text-[var(--accent)] hover:underline"
                        >
                          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                          Open in Telegram
                        </a>
                      ) : (
                        <p>
                          Set <code className="text-[var(--text-secondary)]">TELEGRAM_BOT_USERNAME</code>{" "}
                          on the API for a one-tap deep link. Until then, open your bot
                          and send{" "}
                          <code className="break-all text-[var(--text-secondary)]">
                            /start {telegramRegistration.startPayload}
                          </code>
                          .
                        </p>
                      )}
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            void navigator.clipboard.writeText(
                              telegramRegistration.deepLink ??
                                `/start ${telegramRegistration.startPayload}`
                            );
                            setCopyHint("Copied");
                            setTimeout(() => setCopyHint(null), 2000);
                          }}
                          className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface-0)] px-2.5 py-1.5 text-[var(--text-primary)] hover:bg-[var(--surface-2)]"
                        >
                          <Copy className="h-3.5 w-3.5" aria-hidden />
                          Copy link or /start command
                        </button>
                        {copyHint ? (
                          <span className="text-[var(--success)]">{copyHint}</span>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--text-secondary)]">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-[var(--border)]"
                checked={telegramDraft.telegramUrgentEnabled}
                disabled={!isOwner}
                onChange={(ev) =>
                  setTelegramDraft({
                    ...telegramDraft,
                    telegramUrgentEnabled: ev.target.checked
                  })
                }
              />
              Enable Telegram urgent alerts for this artist
            </label>
            <label className="block text-sm">
              <span className="text-[var(--text-muted)]">Target chat id</span>
              <input
                type="text"
                disabled={!isOwner}
                placeholder="e.g. 123456789"
                className="mt-1 w-full max-w-md rounded-lg border border-[var(--border)] bg-[var(--surface-0)] px-3 py-2 font-mono text-sm text-[var(--text-primary)] disabled:cursor-not-allowed"
                value={telegramDraft.telegramChatId}
                onChange={(ev) =>
                  setTelegramDraft({
                    ...telegramDraft,
                    telegramChatId: ev.target.value
                  })
                }
              />
            </label>
            <p className="text-xs text-[var(--text-muted)]">
              Categories (only checked types are sent to Telegram; in-app and email
              preferences above are unchanged):
            </p>
            {(
              [
                ["approvals", "Approvals (aging + failed execution)"] as const,
                ["overdueTasks", "Severe overdue task clusters"] as const,
                ["staleFollowUps", "Stale follow-up clusters"] as const
              ] as const
            ).map(([key, label]) => (
              <label
                key={key}
                className="flex cursor-pointer items-center gap-2 text-sm text-[var(--text-secondary)]"
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-[var(--border)]"
                  disabled={!isOwner}
                  checked={telegramDraft.telegramNotifyCategories[key]}
                  onChange={(ev) =>
                    setTelegramDraft({
                      ...telegramDraft,
                      telegramNotifyCategories: {
                        ...telegramDraft.telegramNotifyCategories,
                        [key]: ev.target.checked
                      }
                    })
                  }
                />
                {label}
              </label>
            ))}
            {isOwner ? (
              <button
                type="button"
                onClick={() => void saveTelegram()}
                disabled={savingTg}
                className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-4 py-2.5 text-sm font-semibold text-[var(--text-primary)] disabled:opacity-60"
              >
                {savingTg ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Save className="h-4 w-4" aria-hidden />
                )}
                Save Telegram settings
              </button>
            ) : null}
          </div>
        ) : null}
      </SurfaceCard>

      <SurfaceCard
        elevated
        className={`space-y-4 ${!isOwner ? "opacity-80" : ""}`}
      >
        <h2 className="text-base font-semibold text-[var(--text-primary)]">
          Escalation thresholds
        </h2>
        <p className="text-sm text-[var(--text-secondary)]">
          {isOwner
            ? "Owner-only: tune when automation and digests surface work. Leave blank to use defaults (stale days fall back to server default)."
            : "Only owners can edit thresholds. Current values apply to digests and background checks."}
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block text-sm">
            <span className="text-[var(--text-muted)]">Overdue grace (days)</span>
            <input
              type="number"
              min={0}
              max={365}
              disabled={!isOwner}
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-0)] px-3 py-2 text-[var(--text-primary)] disabled:cursor-not-allowed"
              value={escalation.workflowOverdueGraceDays ?? ""}
              onChange={(ev) => {
                const v = ev.target.value;
                setEscalation({
                  ...escalation,
                  workflowOverdueGraceDays:
                    v === "" ? null : Math.min(365, Math.max(0, parseInt(v, 10) || 0))
                });
              }}
            />
          </label>
          <label className="block text-sm">
            <span className="text-[var(--text-muted)]">Stale follow-up (days)</span>
            <input
              type="number"
              min={1}
              max={365}
              disabled={!isOwner}
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-0)] px-3 py-2 text-[var(--text-primary)] disabled:cursor-not-allowed"
              value={escalation.workflowStaleFollowupDays ?? ""}
              onChange={(ev) => {
                const v = ev.target.value;
                setEscalation({
                  ...escalation,
                  workflowStaleFollowupDays:
                    v === "" ? null : Math.min(365, Math.max(1, parseInt(v, 10) || 1))
                });
              }}
            />
          </label>
          <label className="block text-sm">
            <span className="text-[var(--text-muted)]">
              Pending approval min age (days)
            </span>
            <input
              type="number"
              min={0}
              max={365}
              disabled={!isOwner}
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-0)] px-3 py-2 text-[var(--text-primary)] disabled:cursor-not-allowed"
              value={escalation.workflowPendingApprovalDays ?? ""}
              onChange={(ev) => {
                const v = ev.target.value;
                setEscalation({
                  ...escalation,
                  workflowPendingApprovalDays:
                    v === "" ? null : Math.min(365, Math.max(0, parseInt(v, 10) || 0))
                });
              }}
            />
          </label>
        </div>
        {isOwner ? (
          <button
            type="button"
            onClick={() => void saveEscalation()}
            disabled={savingEsc}
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-4 py-2.5 text-sm font-semibold text-[var(--text-primary)] disabled:opacity-60"
          >
            {savingEsc ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Save className="h-4 w-4" aria-hidden />
            )}
            Save thresholds
          </button>
        ) : null}
      </SurfaceCard>
    </div>
  );
}
