import type {
  ArtistRef,
  BandsintownAdapter,
  EventIntel
} from "../adapter.types";

const BASE = "https://rest.bandsintown.com";

export class RealBandsintownAdapter implements BandsintownAdapter {
  readonly id = "bandsintown" as const;
  readonly mode = "real" as const;

  constructor(private readonly appId: string) {}

  async resolveArtist(query: string): Promise<ArtistRef | null> {
    const trimmed = query.trim();
    if (!trimmed) {
      return null;
    }
    const url = `${BASE}/artists/${encodeURIComponent(trimmed)}?app_id=${encodeURIComponent(this.appId)}`;
    const res = await fetch(url);
    if (!res.ok) {
      return null;
    }
    const data: unknown = await res.json();
    if (Array.isArray(data) && data[0] && typeof data[0] === "object") {
      const row = data[0] as Record<string, unknown>;
      return this.rowToArtist(row);
    }
    if (data && typeof data === "object") {
      return this.rowToArtist(data as Record<string, unknown>);
    }
    return null;
  }

  private rowToArtist(row: Record<string, unknown>): ArtistRef | null {
    const name = row["name"];
    if (typeof name !== "string" || !name) {
      return null;
    }
    const id =
      (typeof row["id"] === "string" && row["id"]) ||
      name.replace(/\s+/g, "-").toLowerCase();
    const base: ArtistRef = { id, name };
    const url = typeof row["url"] === "string" ? row["url"] : undefined;
    if (url !== undefined) {
      base.url = url;
    }
    return base;
  }

  async listUpcomingEvents(artistIdentifier: string): Promise<EventIntel[]> {
    const id = artistIdentifier.trim();
    if (!id) {
      return [];
    }
    const url = `${BASE}/artists/${encodeURIComponent(id)}/events?app_id=${encodeURIComponent(this.appId)}`;
    const res = await fetch(url);
    if (!res.ok) {
      return [];
    }
    const data: unknown = await res.json();
    if (!Array.isArray(data)) {
      return [];
    }
    const out: EventIntel[] = [];
    for (const item of data) {
      if (!item || typeof item !== "object") {
        continue;
      }
      const row = item as Record<string, unknown>;
      const venue = row["venue"] as Record<string, unknown> | undefined;
      const venueName =
        venue && typeof venue["name"] === "string"
          ? venue["name"]
          : "Unknown venue";
      const city =
        venue && typeof venue["city"] === "string" ? venue["city"] : undefined;
      const region =
        venue &&
        typeof venue["region"] === "string" &&
        venue["region"] !== ""
          ? venue["region"]
          : undefined;
      const datetime =
        typeof row["datetime"] === "string"
          ? row["datetime"]
          : typeof row["starts_at"] === "string"
            ? row["starts_at"]
            : null;
      if (!datetime) {
        continue;
      }
      const title =
        typeof row["title"] === "string" && row["title"]
          ? row["title"]
          : venueName;
      const offers = row["offers"] as unknown;
      let ticketUrl: string | undefined;
      if (Array.isArray(offers) && offers[0] && typeof offers[0] === "object") {
        const u = (offers[0] as Record<string, unknown>)["url"];
        if (typeof u === "string") {
          ticketUrl = u;
        }
      }
      const eid =
        typeof row["id"] === "string"
          ? row["id"]
          : `${title}-${datetime}`.replace(/\s+/g, "-");
      const intel: EventIntel = {
        id: eid,
        title,
        venueName,
        startsAt: datetime
      };
      if (city !== undefined) {
        intel.city = city;
      }
      if (region !== undefined) {
        intel.region = region;
      }
      if (ticketUrl !== undefined) {
        intel.ticketUrl = ticketUrl;
      }
      out.push(intel);
    }
    return out;
  }

}
