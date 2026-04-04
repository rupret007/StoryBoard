/** Resolved Google OAuth material used to construct real Google adapters. */
export type GoogleAuthForRegistry = {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  /** `null` when using env fallback — assume all StoryBoard scopes granted. */
  scopes: string[] | null;
  calendarId: string;
  driveRootFolderId?: string;
};
