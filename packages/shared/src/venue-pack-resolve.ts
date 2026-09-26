import { DFW_VENUE_PACK_CANONICAL, type DfwVenuePackSeed } from "./dfw-venue-packs";

/** Venues whose primary buyer path is a web application, not a Gmail draft. */
export const DFW_WEB_APPLICATION_VENUE_SLUGS = new Set<string>([
  "birdies-social-club",
  "the-kessler",
  "tulips",
  "granada-theater",
  "herman-marshall"
]);

export function extractApplyUrlFromNotes(notes: string | null | undefined): string | null {
  if (!notes) return null;
  const match = notes.match(/Apply URL:\s*(https?:\/\/\S+)/i);
  return match?.[1] ?? null;
}

export function parseDfwVenuePackSlugFromNotes(notes: string | null | undefined): string | null {
  if (!notes) return null;
  const match = notes.match(/seed:dfw-venue-pack:([a-z0-9-]+)/);
  return match?.[1] ?? null;
}

function normalizeVenueLabel(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

export function lookupDfwVenuePackByVenueName(name: string): DfwVenuePackSeed | null {
  const norm = normalizeVenueLabel(name);
  if (!norm) return null;
  let best: { pack: DfwVenuePackSeed; keyLen: number } | null = null;
  for (const pack of DFW_VENUE_PACK_CANONICAL) {
    if (normalizeVenueLabel(pack.name) === norm) {
      return pack;
    }
    for (const key of pack.matchKeys) {
      const keyNorm = normalizeVenueLabel(key);
      if (norm === keyNorm || norm.includes(keyNorm)) {
        if (!best || keyNorm.length > best.keyLen) {
          best = { pack, keyLen: keyNorm.length };
        }
      }
    }
  }
  return best?.pack ?? null;
}

export function resolveDfwVenuePackFromVenue(venue: {
  name: string;
  notes?: string | null;
}): DfwVenuePackSeed | null {
  const slug = parseDfwVenuePackSlugFromNotes(venue.notes);
  if (slug) {
    const bySlug = DFW_VENUE_PACK_CANONICAL.find((pack) => pack.slug === slug);
    if (bySlug) return bySlug;
  }
  return lookupDfwVenuePackByVenueName(venue.name);
}

export type VenuePackOutreachContext = {
  pack: DfwVenuePackSeed | null;
  applyUrl: string | null;
  bookingEmail: string | null;
  phone: string | null;
  webApplicationFirst: boolean;
};

export function resolveVenuePackOutreachContext(
  venue: { name: string; notes?: string | null },
  bookingContact?: { email?: string | null; phone?: string | null; notes?: string | null } | null
): VenuePackOutreachContext {
  const pack = resolveDfwVenuePackFromVenue(venue);
  const applyUrl =
    pack?.applyUrl ??
    extractApplyUrlFromNotes(venue.notes) ??
    extractApplyUrlFromNotes(bookingContact?.notes ?? null);
  const bookingEmail = bookingContact?.email?.trim() || pack?.email || null;
  const phone = bookingContact?.phone?.trim() || pack?.phone || null;
  const webApplicationFirst = pack ? DFW_WEB_APPLICATION_VENUE_SLUGS.has(pack.slug) : false;
  return { pack, applyUrl, bookingEmail, phone, webApplicationFirst };
}

export function venueApplicationTaskTitle(applyUrl: string): string {
  return `Submit application at ${applyUrl}`;
}
