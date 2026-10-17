import { randomBytes } from "node:crypto";
import {
  DFW_VENUE_PACK_CANONICAL,
  dfwVenuePackContactNotes,
  dfwVenuePackSeedMarker,
  dfwVenuePackVenueNotes,
  type DfwVenuePackSeed
} from "./dfw-venue-packs";

type PgQueryable = {
  query: (text: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
};

function cuidLike(): string {
  const t = Date.now().toString(36);
  const r = randomBytes(8).toString("hex");
  return `c${t}${r}`.slice(0, 25);
}

async function findSeededVenueId(client: PgQueryable, artistId: string, pack: DfwVenuePackSeed): Promise<string | null> {
  const marker = `${dfwVenuePackSeedMarker(pack.slug)}%`;
  const byMarker = await client.query(
    `SELECT id FROM "Venue" WHERE "artistId" = $1 AND notes LIKE $2 LIMIT 1`,
    [artistId, marker]
  );
  if (byMarker.rows[0]?.id) {
    return String(byMarker.rows[0].id);
  }
  const byName = await client.query(
    `SELECT id FROM "Venue" WHERE "artistId" = $1 AND name = $2 LIMIT 1`,
    [artistId, pack.name]
  );
  return byName.rows[0]?.id ? String(byName.rows[0].id) : null;
}

async function upsertVenue(client: PgQueryable, artistId: string, pack: DfwVenuePackSeed): Promise<string> {
  const now = new Date();
  const notes = dfwVenuePackVenueNotes(pack);
  const existingId = await findSeededVenueId(client, artistId, pack);
  if (existingId) {
    await client.query(
      `UPDATE "Venue"
       SET name = $1, city = $2, region = $3, capacity = $4, notes = $5, "updatedAt" = $6
       WHERE id = $7 AND "artistId" = $8`,
      [pack.name, pack.city, pack.region, pack.capacity, notes, now, existingId, artistId]
    );
    return existingId;
  }
  const venueId = cuidLike();
  await client.query(
    `INSERT INTO "Venue" ("id","artistId","name","city","region","capacity","notes","createdAt","updatedAt")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [venueId, artistId, pack.name, pack.city, pack.region, pack.capacity, notes, now, now]
  );
  return venueId;
}

async function upsertBookingContact(client: PgQueryable, artistId: string, venueId: string, pack: DfwVenuePackSeed): Promise<void> {
  const now = new Date();
  const notes = dfwVenuePackContactNotes(pack);
  const marker = `${dfwVenuePackSeedMarker(pack.slug)}%`;
  const existing = await client.query(
    `SELECT id FROM "Contact"
     WHERE "artistId" = $1 AND "venueId" = $2 AND (notes LIKE $3 OR email = $4)
     LIMIT 1`,
    [artistId, venueId, marker, pack.email]
  );
  const fullName = `${pack.name} booking`;
  if (existing.rows[0]?.id) {
    await client.query(
      `UPDATE "Contact"
       SET "contactKind" = 'venue_staff', "fullName" = $1, role = $2, email = $3, phone = $4, notes = $5, "updatedAt" = $6
       WHERE id = $7`,
      [fullName, "Booking", pack.email, pack.phone ?? null, notes, now, existing.rows[0].id]
    );
    return;
  }
  const contactId = cuidLike();
  await client.query(
    `INSERT INTO "Contact" ("id","artistId","venueId","contactKind","fullName","role","email","phone","notes","createdAt","updatedAt")
     VALUES ($1,$2,$3,'venue_staff',$4,$5,$6,$7,$8,$9,$10)`,
    [contactId, artistId, venueId, fullName, "Booking", pack.email, pack.phone ?? null, notes, now, now]
  );
}

export type SeedDfwVenuePacksResult = {
  venueCount: number;
  contactCount: number;
};

/** Idempotent CRM seed for DFW venue packs — safe to re-run after `pnpm db:seed`. */
export async function seedDfwVenuePacks(client: PgQueryable, artistId: string): Promise<SeedDfwVenuePacksResult> {
  for (const pack of DFW_VENUE_PACK_CANONICAL) {
    const venueId = await upsertVenue(client, artistId, pack);
    await upsertBookingContact(client, artistId, venueId, pack);
  }
  return { venueCount: DFW_VENUE_PACK_CANONICAL.length, contactCount: DFW_VENUE_PACK_CANONICAL.length };
}
