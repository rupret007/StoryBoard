import type {
  TicketmasterAdapter,
  TicketmasterEventHit,
  TicketmasterMarketSearch,
  TicketmasterMarketSignals,
  TicketmasterVenueHit
} from "../adapter.types";

const BASE = "https://app.ticketmaster.com/discovery/v2";

export class RealTicketmasterAdapter implements TicketmasterAdapter {
  readonly id = "ticketmaster" as const;
  readonly mode = "real" as const;

  constructor(private readonly apiKey: string) {}

  async discoverVenues(query: string): Promise<{ name: string; city: string }[]> {
    const hits = await this.searchVenues(query, { size: 5 });
    return hits.map((v) => ({ name: v.name, city: v.city }));
  }

  async searchVenues(
    keyword: string,
    opts?: { size?: number }
  ): Promise<TicketmasterVenueHit[]> {
    const size = opts?.size ?? 8;
    const url = new URL(`${BASE}/venues.json`);
    url.searchParams.set("keyword", keyword);
    url.searchParams.set("apikey", this.apiKey);
    url.searchParams.set("size", String(size));
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`Ticketmaster venue search failed (${res.status})`);
    const data = (await res.json()) as {
      _embedded?: { venues?: Record<string, unknown>[] };
    };
    const venues = data._embedded?.venues ?? [];
    return venues.map((v, i) => this.normalizeVenue(v, i));
  }

  private normalizeVenue(
    v: Record<string, unknown>,
    i: number
  ): TicketmasterVenueHit {
    const name = typeof v["name"] === "string" ? v["name"] : "Venue";
    const cityObj = v["city"] as Record<string, unknown> | undefined;
    const stateObj = v["state"] as Record<string, unknown> | undefined;
    const countryObj = v["country"] as Record<string, unknown> | undefined;
    const city =
      cityObj && typeof cityObj["name"] === "string" ? cityObj["name"] : "";
    const state =
      stateObj && typeof stateObj["stateCode"] === "string"
        ? stateObj["stateCode"]
        : undefined;
    const country =
      countryObj && typeof countryObj["countryCode"] === "string"
        ? countryObj["countryCode"]
        : undefined;
    const capacity =
      typeof v["capacity"] === "number" && Number.isFinite(v["capacity"])
        ? v["capacity"]
        : undefined;
    const id =
      typeof v["id"] === "string" ? v["id"] : `tm-venue-${i}-${name}`;
    const url =
      typeof v["url"] === "string" ? v["url"] : undefined;
    const hit: TicketmasterVenueHit = { id, name, city };
    if (state !== undefined) {
      hit.state = state;
    }
    if (country !== undefined) hit.country = country;
    if (capacity !== undefined) hit.capacity = capacity;
    if (url !== undefined) {
      hit.url = url;
    }
    return hit;
  }

  async searchEvents(
    keywordOrCity: string,
    opts?: { size?: number }
  ): Promise<TicketmasterEventHit[]> {
    const size = opts?.size ?? 8;
    const url = new URL(`${BASE}/events.json`);
    url.searchParams.set("keyword", keywordOrCity);
    url.searchParams.set("apikey", this.apiKey);
    url.searchParams.set("size", String(size));
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`Ticketmaster event search failed (${res.status})`);
    const data = (await res.json()) as {
      _embedded?: { events?: Record<string, unknown>[] };
    };
    const events = data._embedded?.events ?? [];
    return events.map((e, i) => this.normalizeEvent(e, i));
  }

  private normalizeEvent(
    e: Record<string, unknown>,
    i: number
  ): TicketmasterEventHit {
    const name = typeof e["name"] === "string" ? e["name"] : "Event";
    const id = typeof e["id"] === "string" ? e["id"] : `tm-ev-${i}`;
    const dates = e["dates"] as Record<string, unknown> | undefined;
    const start = dates?.["start"] as Record<string, unknown> | undefined;
    const startAt =
      start && typeof start["dateTime"] === "string"
        ? start["dateTime"]
        : start && typeof start["localDate"] === "string"
          ? `${start["localDate"]}T12:00:00Z`
          : new Date().toISOString();
    const emb = e["_embedded"] as
      | Record<string, unknown>
      | undefined;
    const venues = emb?.["venues"] as Record<string, unknown>[] | undefined;
    const v0 = venues?.[0];
    const venueName =
      v0 && typeof v0["name"] === "string" ? v0["name"] : "Venue TBA";
    const cityObj = v0?.["city"] as Record<string, unknown> | undefined;
    const stateObj = v0?.["state"] as Record<string, unknown> | undefined;
    const countryObj = v0?.["country"] as Record<string, unknown> | undefined;
    const city =
      cityObj && typeof cityObj["name"] === "string"
        ? cityObj["name"]
        : undefined;
    const url = typeof e["url"] === "string" ? e["url"] : undefined;
    const state =
      stateObj && typeof stateObj["stateCode"] === "string"
        ? stateObj["stateCode"]
        : undefined;
    const country =
      countryObj && typeof countryObj["countryCode"] === "string"
        ? countryObj["countryCode"]
        : undefined;
    const hit: TicketmasterEventHit = {
      id,
      name,
      startAt,
      venueName
    };
    if (city !== undefined) {
      hit.city = city;
    }
    if (state !== undefined) hit.state = state;
    if (country !== undefined) hit.country = country;
    if (url !== undefined) {
      hit.url = url;
    }
    return hit;
  }

  async searchMarket(input: TicketmasterMarketSearch): Promise<TicketmasterMarketSignals> {
    const size = Math.max(1, Math.min(input.size ?? 12, 20));
    const [venueResponse, eventResponse] = await Promise.all([
      this.fetchDiscovery("venues", input, size),
      this.fetchDiscovery("events", input, size)
    ]);
    return {
      venues: (venueResponse._embedded?.venues ?? []).map((venue, index) =>
        this.normalizeVenue(venue, index)
      ),
      events: (eventResponse._embedded?.events ?? []).map((event, index) =>
        this.normalizeEvent(event, index)
      )
    };
  }

  private async fetchDiscovery(
    resource: "venues" | "events",
    input: TicketmasterMarketSearch,
    size: number
  ): Promise<{ _embedded?: { venues?: Record<string, unknown>[]; events?: Record<string, unknown>[] } }> {
    const url = new URL(`${BASE}/${resource}.json`);
    url.searchParams.set("apikey", this.apiKey);
    url.searchParams.set("city", input.city);
    url.searchParams.set("size", String(size));
    if (input.keyword) url.searchParams.set("keyword", input.keyword);
    if (input.country) url.searchParams.set("countryCode", input.country);
    if (input.region && input.country?.toUpperCase() === "US") {
      url.searchParams.set("stateCode", input.region);
    }
    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`Ticketmaster market search failed (${response.status})`);
    }
    return response.json() as Promise<{
      _embedded?: { venues?: Record<string, unknown>[]; events?: Record<string, unknown>[] };
    }>;
  }
}
