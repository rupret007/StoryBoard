CREATE TYPE "ManagerMessageVisibility" AS ENUM ('team', 'owner_only');

ALTER TABLE "ManagerMessage"
ADD COLUMN "visibility" "ManagerMessageVisibility" NOT NULL DEFAULT 'team';

-- Mark every historical full-context assistant row private, including fallback
-- output that did not become the user-visible provider answer. Newer traces
-- also carry an exact initiating-message binding; mark that user row when the
-- binding exists. Legacy unbound runs remain hidden by the runtime projection.
UPDATE "ManagerMessage" AS message
SET "visibility" = 'owner_only'
FROM "ManagerRun" AS run
WHERE message."managerRunId" = run."id"
  AND run."trace" #>> '{providerContext,fullContextEnabled}' = 'true';

UPDATE "ManagerMessage" AS message
SET "visibility" = 'owner_only'
FROM "ManagerRun" AS run
WHERE message."id" = run."trace" #>> '{providerContext,sourceMessageId}'
  AND run."trace" #>> '{providerContext,fullContextEnabled}' = 'true';

-- Before message visibility and caller role were persisted, an interrupted
-- request could stop after its user message but before a ManagerRun/assistant
-- response existed. Concurrent turns make timestamp adjacency ambiguous, and
-- the old endpoint allowed both owners and members to enter the artist's
-- globally enabled full-context path. Fail closed for the whole conversation
-- whenever its user/assistant counts show at least one unmatched request.
-- Completed shared conversations remain unchanged.
UPDATE "ManagerMessage" AS message
SET "visibility" = 'owner_only'
FROM (
  SELECT candidate."conversationId"
  FROM "ManagerMessage" AS candidate
  GROUP BY candidate."conversationId"
  HAVING COUNT(*) FILTER (WHERE candidate."role" = 'user')
       > COUNT(*) FILTER (WHERE candidate."role" = 'assistant')
) AS interrupted
WHERE message."conversationId" = interrupted."conversationId";

-- The legacy implementation created a conversation (with the raw prompt as
-- its title) before writing its first message. A crash in that narrow window
-- leaves no actor or run to inspect, and an empty shell has no useful content
-- to preserve. Replace only those empty titles with a neutral label.
UPDATE "ManagerConversation" AS conversation
SET "title" = 'Manager conversation'
WHERE NOT EXISTS (
  SELECT 1
  FROM "ManagerMessage" AS message
  WHERE message."conversationId" = conversation."id"
);

CREATE INDEX "ManagerMessage_conversationId_visibility_createdAt_idx"
ON "ManagerMessage"("conversationId", "visibility", "createdAt");
