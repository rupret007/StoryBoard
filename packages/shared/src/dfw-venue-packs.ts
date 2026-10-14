export type VenuePackDetails = {
  email: string;
  phone?: string;
  applyUrl: string;
};

export type DfwVenuePackSeed = VenuePackDetails & {
  slug: string;
  name: string;
  city: string;
  region: string;
  capacity: number | null;
  /** Lowercase match keys for manager venue-pack lookup (aliases included). */
  matchKeys: readonly string[];
};

/** Canonical DFW venue-pack rows — single source for CRM seed and manager registry. */
export const DFW_VENUE_PACK_CANONICAL: readonly DfwVenuePackSeed[] = [
  {
    slug: "herman-marshall",
    name: "Herman Marshall",
    city: "Wylie",
    region: "TX",
    capacity: null,
    matchKeys: ["herman marshall"],
    email: "info@hmwhiskey.com",
    applyUrl: "https://hermanmarshall.com/herman-marshall-tasting-room-live-music-application/"
  },
  {
    slug: "my-stomping-grounds",
    name: "My Stomping Grounds",
    city: "Haltom City",
    region: "TX",
    capacity: null,
    matchKeys: ["my stomping grounds"],
    email: "info@mystompinggrounds.com",
    phone: "(817) 231-8080",
    applyUrl: "https://mystompinggrounds.com/book-music"
  },
  {
    slug: "birdies-social-club",
    name: "Birdie's Social Club",
    city: "Fort Worth",
    region: "TX",
    capacity: null,
    matchKeys: ["birdie's social club", "birdies social club"],
    email: "hiring@birdiessocialclub.com",
    applyUrl: "https://www.birdiessocialclub.com/music-submission"
  },
  {
    slug: "dans-silverleaf",
    name: "Dan's Silverleaf",
    city: "Denton",
    region: "TX",
    capacity: null,
    matchKeys: ["dan's silverleaf", "dans silverleaf"],
    email: "booking@danssilverleaf.com",
    phone: "(940) 252-4369",
    applyUrl: "https://danssilverleaf.com/contact"
  },
  {
    slug: "double-wide",
    name: "Double Wide",
    city: "Dallas",
    region: "TX",
    capacity: null,
    matchKeys: ["double wide"],
    email: "dwbookings@gmail.com",
    phone: "(469) 872-0191",
    applyUrl: "https://www.doublewidedallas.com/contact"
  },
  {
    slug: "the-kessler",
    name: "The Kessler Theater",
    city: "Dallas",
    region: "TX",
    capacity: null,
    matchKeys: ["the kessler", "kessler theater"],
    email: "booking@kesslerpresents.com",
    phone: "(214) 272-8346",
    applyUrl: "https://thekessler.org/faq/"
  },
  {
    slug: "granada-theater",
    name: "Granada Theater",
    city: "Dallas",
    region: "TX",
    capacity: null,
    matchKeys: ["granada theater", "the granada"],
    email: "booking@granadatheater.com",
    phone: "(214) 841-4900",
    applyUrl: "https://www.granadatheater.com/faqs"
  },
  {
    slug: "magnolia-motor-lounge",
    name: "Magnolia Motor Lounge",
    city: "Fort Worth",
    region: "TX",
    capacity: null,
    matchKeys: ["magnolia motor lounge", "magnolia motor"],
    email: "booking@mmlbar.com",
    phone: "(817) 332-3344",
    applyUrl: "https://www.magnoliamotorlounge.com/contact"
  },
  {
    slug: "tulips",
    name: "Tulips",
    city: "Fort Worth",
    region: "TX",
    capacity: null,
    matchKeys: ["tulips", "tulips ftw"],
    email: "info@tulipsftw.com",
    phone: "(817) 367-9798",
    applyUrl: "https://tulipsftw.com/book-an-event/"
  },
  {
    slug: "sons-of-hermann-hall",
    name: "Sons of Hermann Hall",
    city: "Dallas",
    region: "TX",
    capacity: null,
    matchKeys: ["sons of hermann hall", "sons of hermann"],
    email: "sohhgm@gmail.com",
    phone: "(972) 834-6899",
    applyUrl: "https://www.sonsofhermannhall.com/services-4"
  },
  {
    slug: "adairs-saloon",
    name: "Adair's Saloon",
    city: "Dallas",
    region: "TX",
    capacity: null,
    matchKeys: ["adair's saloon", "adairs saloon"],
    email: "joel@adairssaloon.com",
    applyUrl: "https://www.adairssaloon.com/contact"
  },
  {
    slug: "club-dada",
    name: "Club Dada",
    city: "Dallas",
    region: "TX",
    capacity: null,
    matchKeys: ["club dada", "club dada dallas"],
    email: "booking@dadadallas.com",
    applyUrl: "https://www.dadadallas.com/contact"
  }
] as const;

export function dfwVenuePackSeedMarker(slug: string): string {
  return `seed:dfw-venue-pack:${slug}`;
}

export function dfwVenuePackVenueNotes(pack: DfwVenuePackSeed): string {
  return `${dfwVenuePackSeedMarker(pack.slug)} — DFW venue pack target. Apply URL: ${pack.applyUrl}`;
}

export function dfwVenuePackContactNotes(pack: DfwVenuePackSeed): string {
  return `${dfwVenuePackSeedMarker(pack.slug)} booking contact. Apply URL: ${pack.applyUrl}`;
}

export function buildVenuePackRegistry(entries: readonly DfwVenuePackSeed[]): Record<string, VenuePackDetails> {
  const registry: Record<string, VenuePackDetails> = {};
  for (const entry of entries) {
    const details: VenuePackDetails = {
      email: entry.email,
      applyUrl: entry.applyUrl,
      ...(entry.phone ? { phone: entry.phone } : {})
    };
    for (const key of entry.matchKeys) {
      registry[key] = details;
    }
  }
  return registry;
}

export const VENUE_PACK_REGISTRY: Record<string, VenuePackDetails> = buildVenuePackRegistry(DFW_VENUE_PACK_CANONICAL);
