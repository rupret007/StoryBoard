import { google } from "googleapis";
import type { CalendarHoldRequest, GoogleCalendarAdapter } from "../adapter.types";

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
    const tz = input.timeZone ?? "UTC";
    const res = await calendar.events.insert({
      calendarId: this.calendarId,
      requestBody: {
        summary: `HOLD: ${input.title}`,
        start: { dateTime: input.start, timeZone: tz },
        end: { dateTime: input.end, timeZone: tz },
        transparency: "transparent"
      }
    });
    return {
      eventId: res.data.id ?? "unknown",
      htmlLink: res.data.htmlLink ?? null
    };
  }
}
