-- Drop non-unique index in favor of unique constraint on (artistId, provider)
DROP INDEX IF EXISTS "IntegrationConnection_artistId_provider_idx";

CREATE UNIQUE INDEX "IntegrationConnection_artistId_provider_key" ON "IntegrationConnection"("artistId", "provider");
