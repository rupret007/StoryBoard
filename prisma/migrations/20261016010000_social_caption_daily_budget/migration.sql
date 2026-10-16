-- Reserve social caption attempts durably before contacting the provider.
CREATE TABLE "SocialCaptionDailyUsage" (
    "day" DATE NOT NULL,
    "calls" INTEGER NOT NULL,

    CONSTRAINT "SocialCaptionDailyUsage_pkey" PRIMARY KEY ("day"),
    CONSTRAINT "SocialCaptionDailyUsage_calls_nonnegative" CHECK ("calls" >= 0)
);
