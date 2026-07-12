-- ArtistOperatingProfile is the canonical source for these four intake facts.
-- Repair historical duplicate memory so model context cannot contain two
-- conflicting values for the same band fact.
UPDATE "ManagerMemoryFact" AS memory
SET
  "value" = CASE memory."key"
    WHEN 'band_mode' THEN to_jsonb(profile."bandMode")
    WHEN 'home_market' THEN jsonb_build_object(
      'city', profile."homeCity",
      'region', profile."homeRegion",
      'country', profile."homeCountry"
    )
    WHEN 'twelve_month_ambition' THEN COALESCE(to_jsonb(profile."twelveMonthAmbition"), 'null'::jsonb)
    WHEN 'constraints' THEN to_jsonb(profile."constraints")
    ELSE memory."value"
  END,
  "sourceType" = 'operating_profile',
  "sourceId" = profile."id",
  "confidence" = 1,
  "confirmedAt" = profile."updatedAt",
  "archivedAt" = NULL,
  "updatedAt" = CURRENT_TIMESTAMP
FROM "ArtistOperatingProfile" AS profile
WHERE memory."artistId" = profile."artistId"
  AND memory."key" IN ('band_mode', 'home_market', 'twelve_month_ambition', 'constraints')
  AND memory."sourceType" = 'manager_intake';
