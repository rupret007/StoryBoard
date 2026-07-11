import type {
  BandsintownAdapter,
  GmailAdapter,
  GmailDraft,
  GoogleCalendarAdapter,
  GoogleDriveAdapter,
  SpotifyAdapter,
  TicketmasterAdapter,
  YoutubeAdapter
} from "../adapter.types";
import type { StoryboardAdapterRegistry } from "../adapter.types";

export class MockGmailAdapter implements GmailAdapter {
  readonly id = "gmail" as const;
  readonly mode = "mock" as const;

  async draftMessage(input: GmailDraft) {
    const preview = `To: ${input.to}\nSubject: ${input.subject}\n\n${input.body}`;
    return { draftId: `mock-draft-${Date.now()}`, preview };
  }

  async sendMessage(draftId: string) {
    return { messageId: `mock-sent-${draftId}` };
  }
}

export class MockGoogleCalendarAdapter implements GoogleCalendarAdapter {
  readonly id = "google-calendar" as const;
  readonly mode = "mock" as const;

  async proposeHold(input: {
    title: string;
    start: string;
    end: string;
    timeZone?: string;
  }) {
    return {
      eventId: `mock-cal-${Date.now()}`,
      htmlLink: `https://calendar.mock/event/${input.title.slice(0, 8)}`
    };
  }
}

export class MockGoogleDriveAdapter implements GoogleDriveAdapter {
  readonly id = "google-drive" as const;
  readonly mode = "mock" as const;

  async uploadDraftMeta(input: { name: string; mimeType: string }) {
    return {
      fileId: `mock-file-${Date.now()}`,
      viewUrl: `https://drive.mock/file/${input.name}`
    };
  }

  async ensureStoryboardFolder(folderName: string) {
    return {
      folderId: `mock-folder-${folderName.slice(0, 8)}`,
      webViewLink: `https://drive.mock/folder/${folderName}`
    };
  }

  async listFolderFiles(folderId: string) {
    return [
      {
        id: `${folderId}-doc1`,
        name: "StoryBoard mock asset",
        webViewLink: `https://drive.mock/file/${folderId}`
      }
    ];
  }
}

export class MockBandsintownAdapter implements BandsintownAdapter {
  readonly id = "bandsintown" as const;
  readonly mode = "mock" as const;

  async resolveArtist(query: string) {
    return {
      id: `mock-bit-artist-${query.slice(0, 12)}`,
      name: query.trim() || "Mock Artist",
      url: `https://www.bandsintown.com/a/mock`
    };
  }

  async listUpcomingEvents(artistIdentifier: string) {
    const base = new Date();
    return [
      {
        id: "mock-bit-e1",
        title: `${artistIdentifier} — Mock Tour Night 1`,
        venueName: "Mock Hall",
        city: "Mockville",
        region: "MV",
        startsAt: new Date(base.getTime() + 86400000 * 7).toISOString(),
        ticketUrl: "https://mock-tickets.example"
      },
      {
        id: "mock-bit-e2",
        title: `${artistIdentifier} — Mock Tour Night 2`,
        venueName: "Mock Basement",
        city: "Mockburg",
        startsAt: new Date(base.getTime() + 86400000 * 21).toISOString()
      }
    ];
  }
}

export class MockTicketmasterAdapter implements TicketmasterAdapter {
  readonly id = "ticketmaster" as const;
  readonly mode = "mock" as const;

  async discoverVenues(query: string) {
    return [
      { name: `TM ${query} Arena (mock)`, city: "Mockville" },
      { name: `TM ${query} Club (mock)`, city: "Mockville" }
    ];
  }

  async searchVenues(keyword: string, opts?: { size?: number }) {
    void opts;
    const rows = await this.discoverVenues(keyword);
    return rows.map((r, i) => ({
      id: `mock-venue-${i}`,
      name: r.name,
      city: r.city,
      state: "MO",
      url: "https://ticketmaster.mock"
    }));
  }

  async searchEvents(keywordOrCity: string, opts?: { size?: number }) {
    void opts;
    return [
      {
        id: "mock-tm-ev-1",
        name: `${keywordOrCity} Mock Showcase`,
        startAt: new Date(Date.now() + 86400000 * 14).toISOString(),
        venueName: "Mock Arena",
        city: "Mockville",
        url: "https://ticketmaster.mock/event/1"
      }
    ];
  }

  async searchMarket(input: {
    city: string;
    region?: string;
    country?: string;
    keyword?: string;
    size?: number;
  }) {
    void input;
    return { venues: [], events: [] };
  }
}

export class MockYoutubeAdapter implements YoutubeAdapter {
  readonly id = "youtube" as const;
  readonly mode = "mock" as const;

  async channelStats(channelId: string) {
    return { title: `Mock Channel ${channelId}`, subscribers: 12000 };
  }
}

export class MockSpotifyAdapter implements SpotifyAdapter {
  readonly id = "spotify" as const;
  readonly mode = "mock" as const;

  async artistProfile(artistName: string) {
    return { name: artistName, followers: 54000 };
  }
}

export const mockAdapters: StoryboardAdapterRegistry = {
  gmail: new MockGmailAdapter(),
  calendar: new MockGoogleCalendarAdapter(),
  drive: new MockGoogleDriveAdapter(),
  bandsintown: new MockBandsintownAdapter(),
  ticketmaster: new MockTicketmasterAdapter(),
  youtube: new MockYoutubeAdapter(),
  spotify: new MockSpotifyAdapter()
};
