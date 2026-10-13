/**
 * Keep browser tests on mock providers, including direct Playwright launches.
 * Explicit empty strings are intentional: deleting a key lets dotenv/Nest load
 * a developer's real credentials from .env in the child process.
 */
export function buildE2eEnvironment(inherited = process.env) {
  return {
    ...Object.fromEntries(Object.entries(inherited).filter(([, value]) => value !== undefined)),
    GOOGLE_CLIENT_ID: "",
    GOOGLE_CLIENT_SECRET: "",
    GOOGLE_OAUTH_REFRESH_TOKEN: "",
    GOOGLE_CALENDAR_DEFAULT_ID: "",
    GOOGLE_DRIVE_ROOT_FOLDER_ID: "",
    INTEGRATION_SECRETS_ENCRYPTION_KEY: "",
    TELEGRAM_BOT_TOKEN: "",
    TELEGRAM_BOT_USERNAME: "",
    TELEGRAM_WEBHOOK_SECRET: "",
    BANDSINTOWN_APP_ID: "",
    TICKETMASTER_API_KEY: "",
    YOUTUBE_API_KEY: "",
    SPOTIFY_CLIENT_ID: "",
    SPOTIFY_CLIENT_SECRET: "",
    OPENAI_API_KEY: "",
    OPENAI_ENABLED: "false",
    BOOKING_ADVISOR_AUTOMATION_ENABLED: "false",
    GMAIL_REPLY_SYNC_ENABLED: "false",
    ENABLE_QUEUE_WORKER: "false"
  };
}
