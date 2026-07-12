"use client";

import { Badge, SurfaceCard } from "@storyboard/ui";
import { Clock3, Save, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { ManagerSettings } from "@/lib/types";

const WEEKDAYS = [
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
  { value: 7, label: "Sunday" }
];

function hourLabel(hour: number) {
  const suffix = hour >= 12 ? "PM" : "AM";
  const display = hour % 12 || 12;
  return `${display}:00 ${suffix}`;
}

export function ManagerCadenceCard({
  initialSettings,
  cadence,
  isOwner
}: {
  initialSettings: ManagerSettings;
  cadence: "daily" | "weekly";
  isOwner: boolean;
}) {
  const [settings, setSettings] = useState(initialSettings);
  const [timezone, setTimezone] = useState(initialSettings.timezone ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setSettings(initialSettings);
    setTimezone(initialSettings.timezone ?? "");
  }, [initialSettings]);

  useEffect(() => {
    if (!timezone) setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Chicago");
  }, [timezone]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const updated = await apiFetch<ManagerSettings>("/manager/settings", {
        method: "PUT",
        json: {
          aiEnabled: settings.aiEnabled,
          fullContextEnabled: settings.aiEnabled && settings.fullContextEnabled,
          scheduleEnabled: settings.scheduleEnabled,
          scheduledAiEnabled: settings.scheduleEnabled && settings.aiEnabled && settings.scheduledAiEnabled,
          scheduleAudience: settings.scheduleAudience,
          timezone: timezone.trim() || null,
          dailyHour: settings.dailyHour,
          weeklyDay: settings.weeklyDay
        }
      });
      setSettings(updated);
      setTimezone(updated.timezone ?? "");
      setMessage("Manager cadence saved.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save Manager cadence");
    } finally {
      setSaving(false);
    }
  }

  const scheduleText = settings.scheduleEnabled && timezone
    ? `${cadence === "weekly" ? `${WEEKDAYS.find((day) => day.value === settings.weeklyDay)?.label ?? "Monday"}s` : "Every day"} after ${hourLabel(settings.dailyHour)} in ${timezone}`
    : "On request only";

  return (
    <div data-testid="manager-cadence">
      <SurfaceCard>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Clock3 className="h-4 w-4 text-[var(--accent)]" />
              <h2 className="font-semibold">Manager cadence</h2>
            </div>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              Choose whether StoryBoard should prepare the band&apos;s {cadence} brief on its own. Scheduled delivery is opt-in and creates an in-app update; it never sends messages or changes band records.
            </p>
          </div>
          <Badge variant={settings.scheduleEnabled ? "success" : "neutral"}>{settings.scheduleEnabled ? "scheduled" : "on request"}</Badge>
        </div>

        <div className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--surface-0)] p-3 text-sm">
          <p className="font-medium">{scheduleText}</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            {settings.lastScheduledAt ? `Last prepared ${new Date(settings.lastScheduledAt).toLocaleString()}.` : "No scheduled brief has been prepared yet."}
          </p>
        </div>

        {!isOwner ? (
          <p className="mt-4 text-xs text-[var(--text-muted)]">An owner controls the schedule, recipients, AI cost, and data policy.</p>
        ) : (
          <form className="mt-5 space-y-5 border-t border-[var(--border)] pt-5" onSubmit={(event) => void save(event)}>
            {error ? <p role="alert" className="rounded-lg border border-red-500/25 bg-red-500/10 p-3 text-sm text-red-200">{error}</p> : null}
            {message ? <p role="status" className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 p-3 text-sm text-emerald-100">{message}</p> : null}

            <label className="flex items-start gap-3">
              <input aria-label="Prepare Manager briefs on schedule" className="mt-1 h-4 w-4" type="checkbox" checked={settings.scheduleEnabled} onChange={(event) => setSettings((current) => ({ ...current, scheduleEnabled: event.target.checked, ...(!event.target.checked ? { scheduledAiEnabled: false } : {}) }))} />
              <span><span className="block text-sm font-medium">Prepare this brief on schedule</span><span className="block text-xs text-[var(--text-muted)]">The queue checks local time and creates at most one brief per local day or week.</span></span>
            </label>

            <div className="grid gap-4 md:grid-cols-3">
              <label><span className="sb-label">Timezone</span><input aria-label="Manager schedule timezone" className="sb-input mt-1.5" value={timezone} onChange={(event) => setTimezone(event.target.value)} placeholder="America/Chicago" /></label>
              <label><span className="sb-label">Prepare after</span><select aria-label="Manager schedule hour" className="sb-select mt-1.5 w-full" value={settings.dailyHour} onChange={(event) => setSettings((current) => ({ ...current, dailyHour: Number(event.target.value) }))}>{Array.from({ length: 15 }, (_, index) => index + 6).map((hour) => <option value={hour} key={hour}>{hourLabel(hour)}</option>)}</select></label>
              {cadence === "weekly" ? <label><span className="sb-label">Weekly day</span><select aria-label="Manager schedule weekday" className="sb-select mt-1.5 w-full" value={settings.weeklyDay} onChange={(event) => setSettings((current) => ({ ...current, weeklyDay: Number(event.target.value) }))}>{WEEKDAYS.map((day) => <option value={day.value} key={day.value}>{day.label}</option>)}</select></label> : <label><span className="sb-label">Notify</span><select aria-label="Manager schedule audience" className="sb-select mt-1.5 w-full" value={settings.scheduleAudience} onChange={(event) => setSettings((current) => ({ ...current, scheduleAudience: event.target.value as ManagerSettings["scheduleAudience"] }))}><option value="owners">Owners only</option><option value="team">Owners and members</option></select></label>}
              {cadence === "weekly" ? <label><span className="sb-label">Notify</span><select aria-label="Manager schedule audience" className="sb-select mt-1.5 w-full" value={settings.scheduleAudience} onChange={(event) => setSettings((current) => ({ ...current, scheduleAudience: event.target.value as ManagerSettings["scheduleAudience"] }))}><option value="owners">Owners only</option><option value="team">Owners and members</option></select></label> : null}
            </div>

            <div className="rounded-xl border border-[var(--border)] p-4">
              <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-[var(--accent)]" /><p className="text-sm font-medium">Optional model reasoning</p></div>
              <p className="mt-1 text-xs text-[var(--text-muted)]">Deterministic, evidence-ranked briefs work without a provider. These controls never expand the Manager&apos;s authority.</p>
              <div className="mt-3 space-y-3">
                <label className="flex items-start gap-3"><input aria-label="Enable Manager AI reasoning" className="mt-1 h-4 w-4" type="checkbox" checked={settings.aiEnabled} onChange={(event) => setSettings((current) => ({ ...current, aiEnabled: event.target.checked, ...(!event.target.checked ? { fullContextEnabled: false, scheduledAiEnabled: false } : {}) }))} /><span><span className="block text-sm">Enable configured OpenAI reasoning</span><span className="block text-xs text-[var(--text-muted)]">Manual refreshes and chat may use the configured Manager model.</span></span></label>
                <label className="flex items-start gap-3"><input aria-label="Allow full Manager context" className="mt-1 h-4 w-4" type="checkbox" disabled={!settings.aiEnabled} checked={settings.fullContextEnabled} onChange={(event) => setSettings((current) => ({ ...current, fullContextEnabled: event.target.checked }))} /><span><span className="block text-sm">Allow full tenant-scoped StoryBoard context</span><span className="block text-xs text-[var(--text-muted)]">Includes CRM and operating notes. General inbox content and provider credentials remain excluded.</span></span></label>
                <label className="flex items-start gap-3"><input aria-label="Use AI for scheduled Manager briefs" className="mt-1 h-4 w-4" type="checkbox" disabled={!settings.aiEnabled || !settings.scheduleEnabled} checked={settings.scheduledAiEnabled} onChange={(event) => setSettings((current) => ({ ...current, scheduledAiEnabled: event.target.checked }))} /><span><span className="block text-sm">Use model reasoning for scheduled briefs</span><span className="block text-xs text-[var(--text-muted)]">Separate opt-in because scheduled calls may use provider tokens. Off keeps scheduled briefs deterministic and free of model calls.</span></span></label>
              </div>
            </div>

            <button className="sb-btn-primary" disabled={saving || (settings.scheduleEnabled && !timezone.trim())}><Save className="h-4 w-4" /> {saving ? "Saving…" : "Save cadence"}</button>
          </form>
        )}
      </SurfaceCard>
    </div>
  );
}
