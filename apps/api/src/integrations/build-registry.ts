import type { StoryboardAdapterRegistry } from "./adapters/adapter.types";
import { mockAdapters } from "./adapters/mock/mock-adapters";
import { RealBandsintownAdapter } from "./adapters/bandsintown/real-bandsintown.adapter";
import { RealGoogleCalendarAdapter } from "./adapters/calendar/real-google-calendar.adapter";
import { RealGoogleDriveAdapter } from "./adapters/drive/real-google-drive.adapter";
import { RealGmailAdapter } from "./adapters/gmail/real-gmail.adapter";
import { RealTicketmasterAdapter } from "./adapters/ticketmaster/real-ticketmaster.adapter";
import type { GoogleAuthForRegistry } from "./google-auth.types";
import {
  CALENDAR_EVENTS_SCOPE,
  DRIVE_FILE_SCOPE,
  GMAIL_SCOPE,
  scopeAllows
} from "./google-oauth.constants";

export function cred(v: string | undefined): v is string {
  return Boolean(v && v.trim() && v.trim() !== "replace-me");
}

export type IntegrationEnvSlice = {
  GOOGLE_CLIENT_ID: string | undefined;
  GOOGLE_CLIENT_SECRET: string | undefined;
  GOOGLE_OAUTH_REFRESH_TOKEN: string | undefined;
  GOOGLE_CALENDAR_DEFAULT_ID: string | undefined;
  GOOGLE_DRIVE_ROOT_FOLDER_ID: string | undefined;
  BANDSINTOWN_APP_ID: string | undefined;
  BANDSINTOWN_EVENT_ARTIST: string | undefined;
  TICKETMASTER_API_KEY: string | undefined;
};

function googleAuthFromEnv(env: IntegrationEnvSlice): GoogleAuthForRegistry | null {
  if (
    !cred(env.GOOGLE_CLIENT_ID) ||
    !cred(env.GOOGLE_CLIENT_SECRET) ||
    !cred(env.GOOGLE_OAUTH_REFRESH_TOKEN)
  ) {
    return null;
  }
  const cal =
    cred(env.GOOGLE_CALENDAR_DEFAULT_ID) &&
    env.GOOGLE_CALENDAR_DEFAULT_ID!.trim() !== ""
      ? env.GOOGLE_CALENDAR_DEFAULT_ID!.trim()
      : "primary";
  return {
    clientId: env.GOOGLE_CLIENT_ID!,
    clientSecret: env.GOOGLE_CLIENT_SECRET!,
    refreshToken: env.GOOGLE_OAUTH_REFRESH_TOKEN!,
    scopes: null,
    calendarId: cal,
    ...(cred(env.GOOGLE_DRIVE_ROOT_FOLDER_ID)
      ? { driveRootFolderId: env.GOOGLE_DRIVE_ROOT_FOLDER_ID!.trim() }
      : {})
  };
}

/**
 * Builds the adapter registry. When `googleOverride` is set, it replaces env-based
 * Google credentials (artist connection path). When omitted, uses env refresh token
 * when present (phase 2A fallback).
 */
export function buildAdapterRegistry(
  env: IntegrationEnvSlice,
  googleOverride?: GoogleAuthForRegistry | null
): StoryboardAdapterRegistry {
  const google =
    googleOverride != null ? googleOverride : googleAuthFromEnv(env);

  const gmail =
    google && scopeAllows(google.scopes, GMAIL_SCOPE)
      ? new RealGmailAdapter(
          google.clientId,
          google.clientSecret,
          google.refreshToken
        )
      : mockAdapters.gmail;

  const calendar =
    google && scopeAllows(google.scopes, CALENDAR_EVENTS_SCOPE)
      ? new RealGoogleCalendarAdapter(
          google.clientId,
          google.clientSecret,
          google.refreshToken,
          google.calendarId
        )
      : mockAdapters.calendar;

  const drive =
    google && scopeAllows(google.scopes, DRIVE_FILE_SCOPE)
      ? new RealGoogleDriveAdapter(
          google.clientId,
          google.clientSecret,
          google.refreshToken,
          google.driveRootFolderId
        )
      : mockAdapters.drive;

  const bitConfigured = cred(env.BANDSINTOWN_APP_ID);
  const bandsintown = bitConfigured
    ? new RealBandsintownAdapter(
        env.BANDSINTOWN_APP_ID!,
        cred(env.BANDSINTOWN_EVENT_ARTIST)
          ? env.BANDSINTOWN_EVENT_ARTIST!.trim()
          : undefined
      )
    : mockAdapters.bandsintown;

  const tmConfigured = cred(env.TICKETMASTER_API_KEY);
  const ticketmaster = tmConfigured
    ? new RealTicketmasterAdapter(env.TICKETMASTER_API_KEY!)
    : mockAdapters.ticketmaster;

  return {
    gmail,
    calendar,
    drive,
    bandsintown,
    ticketmaster,
    youtube: mockAdapters.youtube,
    spotify: mockAdapters.spotify
  };
}

export function providerModes(registry: StoryboardAdapterRegistry) {
  return {
    gmail: registry.gmail.mode,
    bandsintown: registry.bandsintown.mode,
    ticketmaster: registry.ticketmaster.mode,
    calendar: registry.calendar.mode,
    drive: registry.drive.mode,
    youtube: registry.youtube.mode,
    spotify: registry.spotify.mode
  } as const;
}
