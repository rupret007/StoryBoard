-- Distinguish an atomic pre-send claim from a confirmed delivery.
-- Existing rows were inserted only after a successful send.

CREATE TYPE "TelegramUrgentDedupeStatus" AS ENUM ('attempted', 'sent');

ALTER TABLE "TelegramUrgentDedupe"
ADD COLUMN "status" "TelegramUrgentDedupeStatus" NOT NULL DEFAULT 'sent';

ALTER TABLE "TelegramUrgentDedupe"
ALTER COLUMN "status" SET DEFAULT 'attempted';

ALTER TABLE "TelegramUrgentDedupe"
ALTER COLUMN "sentAt" DROP NOT NULL;

ALTER TABLE "TelegramUrgentDedupe"
ALTER COLUMN "sentAt" DROP DEFAULT;
