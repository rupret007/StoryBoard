import { google } from "googleapis";
import type { CalendarHoldRequest, GoogleCalendarAdapter } from "../adapter.types";

const GOOGLE_REQUEST_TIMEOUT_MS = 30_000;

export function googleCalendarEventBody(input: CalendarHoldRequest) {
  const confirmed = input.kind === "confirmed";
  const timeZone = input.timeZone ?? "UTC";
  return {
    summary: confirmed ? input.title : `HOLD: ${input.title}`,
    start: { dateTime: input.start, timeZone },
    end: { dateTime: input.end, timeZone },
    transparency: confirmed ? "opaque" as const : "transparent" as const
  };
}

export class RealGoogleCalendarAdapter implements GoogleCalendarAdapter {
  readonly id = "google-calendar" as const;
  readonly mode = "real" as const;

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly refreshToken: string,
    private readonly calendarId: string
  ) {}

  async proposeHold(input: CalendarHoldRequest) {
    const oauth2 = new google.auth.OAuth2(this.clientId, this.clientSecret);
    oauth2.setCredentials({ refresh_token: this.refreshToken });
    const calendar = google.calendar({ version: "v3", auth: oauth2 });
    const res = await calendar.events.insert(
      {
        calendarId: this.calendarId,
        requestBody: googleCalendarEventBody(input)
      },
      { timeout: GOOGLE_REQUEST_TIMEOUT_MS }
    );
    return {
      eventId: res.data.id ?? "unknown",
      htmlLink: res.data.htmlLink ?? null
    };
  }
}
