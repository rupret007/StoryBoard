import { z } from "zod";

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    API_PORT: z.coerce.number().int().positive().default(4000),
    WEB_URL: z.string().url().default("http://localhost:3000"),
    DATABASE_URL: z.string().min(1, "DATABASE_URL is required (see .env.example)"),
    REDIS_URL: z.string().min(1, "REDIS_URL is required (see .env.example)"),
    SESSION_SECRET: z
      .string()
      .min(8, "SESSION_SECRET must be at least 8 characters"),
    COOKIE_DOMAIN: z.string().optional(),
    OPENAI_ENABLED: z
      .string()
      .optional()
      .transform((value) => value === "true"),
    OPENAI_API_KEY: z.string().optional(),
    OPENAI_MODEL: z.string().optional(),
    OPENAI_COMMAND_MODEL: z.string().optional(),
    OPENAI_SUMMARY_MODEL: z.string().optional(),
    OPENAI_ADVISOR_CONTEXT: z.enum(["aggregate", "full"]).default("aggregate"),
    OPENAI_MANAGER_MODEL: z.string().optional(),
    BOOKING_ADVISOR_AUTOMATION_ENABLED: z.string().optional().transform((value) => value === "true"),
    GMAIL_REPLY_SYNC_ENABLED: z.string().optional().transform((value) => value === "true"),
    GMAIL_REPLY_SYNC_REPEAT_MS: z.coerce.number().int().positive().optional(),
    MANAGER_SCHEDULE_SCAN_MS: z.coerce.number().int().min(60000).optional(),
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    GOOGLE_OAUTH_REFRESH_TOKEN: z.string().optional(),
    GOOGLE_REDIRECT_URI: z.string().optional(),
    GOOGLE_CALENDAR_DEFAULT_ID: z.string().optional(),
    GOOGLE_DRIVE_ROOT_FOLDER_ID: z.string().optional(),
    INTEGRATION_SECRETS_ENCRYPTION_KEY: z.string().optional(),
    ENABLE_QUEUE_WORKER: z.string().optional(),
    GMAIL_USER_EMAIL: z.string().optional(),
    BANDSINTOWN_APP_ID: z.string().optional(),
    TICKETMASTER_API_KEY: z.string().optional(),
    GOOGLE_OPERATOR_REDIRECT_URI: z
      .string()
      .url()
      .default("http://localhost:4000/auth/operator/google/callback"),
    AUTH_DEV_BYPASS: z
      .string()
      .optional()
      .transform((value) => value === "true"),
    // Local development deliberately supports `dev@localhost`, which Zod's
    // internet-email validator rejects despite it being a valid local mailbox.
    SEED_OPERATOR_EMAIL: z.string().trim().min(3).max(320).refine(
      (value) => /^[^@\s]+@[^@\s]+$/.test(value),
      "SEED_OPERATOR_EMAIL must contain a local part and domain"
    ).optional(),
    INVITE_EXPIRY_DAYS: z.coerce.number().int().positive().max(90).default(14),
    WORKFLOW_STALE_FOLLOWUP_DAYS: z.coerce
      .number()
      .int()
      .positive()
      .max(90)
      .default(7),
    WORKFLOW_AUTOMATION_REPEAT_MS: z.coerce
      .number()
      .int()
      .positive()
      .optional(),
    WORKFLOW_DIGEST_DAILY_MS: z.coerce
      .number()
      .int()
      .positive()
      .optional(),
    WORKFLOW_DIGEST_WEEKLY_MS: z.coerce
      .number()
      .int()
      .positive()
      .optional(),
    TELEGRAM_BOT_TOKEN: z.string().optional(),
    TELEGRAM_BOT_USERNAME: z
      .string()
      .optional()
      .transform((v) => (typeof v === "string" && v.trim() ? v.trim() : undefined)),
    TELEGRAM_REGISTRATION_TTL_MINUTES: z.coerce
      .number()
      .int()
      .min(5)
      .max(120)
      .optional(),
    TELEGRAM_WEBHOOK_SECRET: z
      .string()
      .optional()
      .transform((v) => (typeof v === "string" && v.trim() ? v.trim() : undefined))
  })
  .superRefine((data, ctx) => {
    if (data.AUTH_DEV_BYPASS && data.NODE_ENV === "production") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "AUTH_DEV_BYPASS cannot be enabled in production",
        path: ["AUTH_DEV_BYPASS"]
      });
    }
    if (!data.OPENAI_ENABLED) {
      return;
    }
    const key = data.OPENAI_API_KEY?.trim();
    if (!key || key === "replace-me") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "OPENAI_API_KEY must be set to a real key when OPENAI_ENABLED=true",
        path: ["OPENAI_API_KEY"]
      });
    }
  });

export type StoryboardEnv = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): StoryboardEnv {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
      .join("; ");
    throw new Error(
      `StoryBoard env validation failed. Copy .env.example to .env and adjust. ${detail}`
    );
  }
  return parsed.data;
}
