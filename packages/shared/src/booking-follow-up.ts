const CALENDAR_DATE = /^(\d{4}-\d{2}-\d{2})$/;

/**
 * Persist a pitch-campaign follow-up date-input as noon UTC, or `null` when
 * the operator clears the field. The recipient PATCH schema already accepts
 * a nullable date; the editor must send `null` so a cleared input is not a
 * no-op against a stored day.
 */
export function campaignFollowUpDueAtWrite(date: string | null | undefined): string | null {
  if (date == null) return null;
  const match = CALENDAR_DATE.exec(date.trim());
  if (!match) return null;
  return `${match[1]}T12:00:00.000Z`;
}

export function campaignFollowUpDueAtChanged(
  currentIso: string | null | undefined,
  inputDate: string
): boolean {
  const currentDay = currentIso?.slice(0, 10) ?? "";
  const nextDay = campaignFollowUpDueAtWrite(inputDate)?.slice(0, 10) ?? "";
  return currentDay !== nextDay;
}
