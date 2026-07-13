import { BadRequestException, Injectable } from "@nestjs/common";
import {
  enqueueResearchRefreshPayloadSchema,
  researchBookingIntelPayloadSchema
} from "@storyboard/shared";
import { ApprovalStatus } from "../generated/prisma/enums";
import { ApprovalsService } from "../approvals/approvals.service";
import { AuditService } from "../audit/audit.service";
import { providerModes } from "../integrations/build-registry";
import { AdapterRegistryResolver } from "../integrations/adapter-registry.resolver";
import type { StoryboardAdapterRegistry } from "../integrations/adapters/adapter.types";
import { PrismaService } from "../prisma/prisma.service";
import { StoryboardQueueService } from "../queue/storyboard-queue.service";
import { TasksService } from "../tasks/tasks.service";
import type {
  ExecuteCommandBody,
  StructuredCommandIntent
} from "./execute-command.schema";

function norm(s: string) {
  return s.trim().toLowerCase();
}

@Injectable()
export class CommandsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly approvals: ApprovalsService,
    private readonly tasks: TasksService,
    private readonly registryResolver: AdapterRegistryResolver,
    private readonly storyboardQueue: StoryboardQueueService
  ) {}

  async execute(
    artistId: string,
    body: ExecuteCommandBody,
    actorLabel: string,
    actorOperatorId?: string | null
  ): Promise<{
    intent: string;
    dryRun: boolean;
    result: Record<string, unknown>;
    commandRunId: string;
    providerModes?: ReturnType<typeof providerModes>;
  }> {
    const adapters = await this.registryResolver.resolveForArtist(artistId);
    const dryRun = body.dryRun ?? true;
    let intent: string;
    let result: Record<string, unknown>;
    let rawInputForLog: string;
    let extraProviderModes: ReturnType<typeof providerModes> | undefined;

    if (body.intent) {
      rawInputForLog = `[structured:${body.intent}]`;
      const r = await this.runStructuredIntent(
        body.intent,
        artistId,
        actorLabel,
        adapters,
        body.payload,
        actorOperatorId
      );
      intent = r.intent;
      result = r.result;
      if (r.providerModes) {
        extraProviderModes = r.providerModes;
      }
    } else {
      const text = body.text!.trim();
      rawInputForLog = text;
      const r = await this.resolveFromNaturalLanguage(
        artistId,
        text,
        actorLabel,
        adapters,
        actorOperatorId
      );
      intent = r.intent;
      result = r.result;
      if (r.providerModes) {
        extraProviderModes = r.providerModes;
      }
    }

    result = {
      ...result,
      providerModes:
        extraProviderModes ??
        (result["providerModes"] as object) ??
        providerModes(adapters)
    };

    const run = await this.prisma.client.commandRun.create({
      data: {
        artistId,
        rawInput: body.text?.trim() ? body.text.trim() : rawInputForLog,
        intent,
        resolvedAction: result as object,
        dryRun,
        status: "completed"
      }
    });

    await this.audit.log({
      artistId,
      aggregateType: "CommandRun",
      aggregateId: run.id,
      action: "command.executed",
      actorLabel,
      actorOperatorId: actorOperatorId ?? null,
      metadata: { intent, dryRun, structured: Boolean(body.intent) }
    });

    return {
      intent,
      dryRun,
      result,
      commandRunId: run.id,
      providerModes: providerModes(adapters)
    };
  }

  private async runStructuredIntent(
    intent: StructuredCommandIntent,
    artistId: string,
    actorLabel: string,
    adapters: StoryboardAdapterRegistry,
    payload?: Record<string, unknown>,
    actorOperatorId?: string | null
  ): Promise<{
    intent: string;
    result: Record<string, unknown>;
    providerModes?: ReturnType<typeof providerModes>;
  }> {
    switch (intent) {
      case "list_pending_approvals":
        return this.runListPendingApprovals(artistId);
      case "list_overdue_tasks":
        return this.runListOverdueTasks(artistId);
      case "list_stale_followups":
        return this.runListStaleFollowups(artistId, payload);
      case "booking_pipeline_health":
        return this.runBookingPipelineHealth(artistId);
      case "draft_venue_outreach":
        return this.runDraftVenueOutreach(
          artistId,
          actorLabel,
          adapters,
          actorOperatorId
        );
      case "rank_venues_by_fit":
        return this.runRankVenuesByFit(artistId, adapters);
      case "draft_release_checklist":
        return this.runDraftReleaseChecklist(artistId, actorOperatorId);
      case "research_booking_intel":
        return this.runResearchBookingIntel(artistId, adapters, payload);
      case "enqueue_research_refresh": {
        const parsed = enqueueResearchRefreshPayloadSchema.safeParse(
          payload ?? {}
        );
        const city = parsed.success ? parsed.data.city : undefined;
        await this.storyboardQueue.enqueueResearchRefresh(artistId, city);
        return {
          intent: "enqueue_research_refresh",
          result: {
            queued: true,
            city: city ?? null,
            note:
              "Enqueued research.refresh on storyboard-enrichment when Redis is available."
          },
          providerModes: providerModes(adapters)
        };
      }
      default: {
        const _exhaustive: never = intent;
        return _exhaustive;
      }
    }
  }

  private async runListPendingApprovals(artistId: string) {
    const pending = await this.approvals.pending(artistId);
    return {
      intent: "list_pending_approvals",
      result: { pendingApprovals: pending, count: pending.length }
    };
  }

  private async runListOverdueTasks(artistId: string) {
    const overdue = await this.tasks.overdueByDueDate(artistId);
    return {
      intent: "list_overdue_tasks",
      result: { overdueTasks: overdue, count: overdue.length }
    };
  }

  private async runListStaleFollowups(
    artistId: string,
    payload?: Record<string, unknown>
  ) {
    const raw = payload?.["days"];
    const days =
      typeof raw === "number" && Number.isFinite(raw)
        ? Math.min(365, Math.max(1, Math.trunc(raw)))
        : 7;
    const stale = await this.tasks.followUpsOlderThan(artistId, days);
    return {
      intent: "list_stale_followups",
      result: { staleFollowUps: stale, count: stale.length, days }
    };
  }

  private async runBookingPipelineHealth(artistId: string) {
    const opps = await this.prisma.client.bookingOpportunity.findMany({
      where: { artistId }
    });
    const counts: Record<string, number> = {};
    for (const o of opps) {
      counts[o.stage] = (counts[o.stage] ?? 0) + 1;
    }
    return {
      intent: "booking_pipeline_health",
      result: { stageCounts: counts, total: opps.length }
    };
  }

  private async runDraftVenueOutreach(
    artistId: string,
    actorLabel: string,
    adapters: StoryboardAdapterRegistry,
    actorOperatorId?: string | null
  ) {
    const venues = await this.prisma.client.venue.findMany({
      where: { artistId },
      orderBy: [{ fitScore: "desc" }, { updatedAt: "desc" }],
      take: 5
    });
    const drafts: {
      venueId: string;
      message: { to: string; subject: string; body: string };
    }[] = [];
    const draftPreviews: { venueId: string; subject: string; preview: string }[] =
      [];
    for (const v of venues.slice(0, 3)) {
      const contact =
        (await this.prisma.client.contact.findFirst({
          where: { artistId, venueId: v.id }
        })) ?? null;
      const to = contact?.email ?? "booking@venue.mock";
      const subject = `Show inquiry — ${v.name}`;
      const body = `Hi — we're routing dates through StoryBoard. Interested in ${v.name} for a future date. Can we grab 15 minutes?\n\n— ${actorLabel}`;
      const preview = `To: ${to}\nSubject: ${subject}\n\n${body}`;
      drafts.push({
        venueId: v.id,
        message: { to, subject, body }
      });
      draftPreviews.push({ venueId: v.id, subject, preview });
    }
    const approval = await this.approvals.create(artistId, {
      title: "Draft outreach emails (do not send)",
      actionType: "outbound_email_batch",
      payload: {
        drafts,
        provider: "gmail",
        proposedInCommand: true
      },
      proposedBy: actorLabel,
      status: ApprovalStatus.pending,
      actorOperatorId: actorOperatorId ?? null
    });
    return {
      intent: "draft_venue_outreach",
      result: {
        draftPreviews,
        approvalId: approval.id,
        note: "Structured drafts stored for execution after approval. No Gmail calls until you approve and execute.",
        gmailModeAtProposal: adapters.gmail.mode
      }
    };
  }

  private async runRankVenuesByFit(
    artistId: string,
    adapters: StoryboardAdapterRegistry
  ) {
    const venues = await this.prisma.client.venue.findMany({
      where: { artistId }
    });
    const ranked = [...venues].sort(
      (a, b) => (b.fitScore ?? 0) - (a.fitScore ?? 0)
    );
    return {
      intent: "rank_venues_by_fit",
      result: {
        rankedVenues: ranked.map((v) => ({
          id: v.id,
          name: v.name,
          city: v.city,
          fitScore: v.fitScore,
          driveMinutesFromBase: v.driveMinutesFromBase
        })),
        providerModes: providerModes(adapters),
        note:
          "Ranking orders only artist-owned CRM venues by fitScore. Use Find shows for Ticketmaster or manual market prospecting."
      }
    };
  }

  private async runResearchBookingIntel(
    artistId: string,
    adapters: StoryboardAdapterRegistry,
    payload?: Record<string, unknown>
  ) {
    const parsed = researchBookingIntelPayloadSchema.safeParse(payload ?? {});
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    const artist = await this.prisma.client.artist.findUniqueOrThrow({
      where: { id: artistId }
    });
    const city =
      parsed.data.city ??
      `${artist.name.split(" ")[0] ?? artist.name} market`;
    const resolved = await adapters.bandsintown.resolveArtist(artist.name);
    const events = resolved
      ? await adapters.bandsintown.listUpcomingEvents(resolved.name)
      : await adapters.bandsintown.listUpcomingEvents(artist.name);
    const tmVenues = await adapters.ticketmaster.searchVenues(city, {
      size: 8
    });
    const tmEvents = await adapters.ticketmaster.searchEvents(city, {
      size: 8
    });
    return {
      intent: "research_booking_intel",
      result: {
        city,
        bandsintownArtist: resolved,
        bandsintownUpcomingEvents: events,
        ticketmasterVenues: tmVenues,
        ticketmasterEvents: tmEvents,
        note:
          "Bandsintown is limited to the active StoryBoard artist's own event context. Ticketmaster or manual entry supplies market discovery.",
        providerModes: providerModes(adapters)
      },
      providerModes: providerModes(adapters)
    };
  }

  private async runDraftReleaseChecklist(
    artistId: string,
    actorOperatorId?: string | null
  ) {
    const steps = [
      "Confirm distributor upload date",
      "Prep social grid + draft posts",
      "Book listening session or live Q&A",
      "Update pitch sheet for promoters"
    ];
    const approval = await this.approvals.create(artistId, {
      title: "Release planning checklist (draft)",
      actionType: "release_checklist_draft",
      payload: { steps, dryRun: true },
      proposedBy: "command-bar",
      status: ApprovalStatus.pending,
      actorOperatorId: actorOperatorId ?? null
    });
    return {
      intent: "draft_release_checklist",
      result: { steps, approvalId: approval.id }
    };
  }

  private async resolveFromNaturalLanguage(
    artistId: string,
    rawInput: string,
    actorLabel: string,
    adapters: StoryboardAdapterRegistry,
    actorOperatorId?: string | null
  ): Promise<{
    intent: string;
    result: Record<string, unknown>;
    providerModes?: ReturnType<typeof providerModes>;
  }> {
    const text = norm(rawInput);

    if (
      text.includes("approval") ||
      text.includes("needs approval") ||
      text.includes("approve today")
    ) {
      return this.runListPendingApprovals(artistId);
    }

    if (
      text.includes("overdue") ||
      text.includes("follow up") ||
      text.includes("follow-up")
    ) {
      if (text.includes("7") || text.includes("seven")) {
        const stale = await this.tasks.followUpsOlderThan(artistId, 7);
        return {
          intent: "list_stale_followups",
          result: { staleFollowUps: stale, count: stale.length, days: 7 }
        };
      }
      return this.runListOverdueTasks(artistId);
    }

    if (
      text.includes("pipeline") ||
      text.includes("booking health") ||
      text.includes("summarize booking")
    ) {
      return this.runBookingPipelineHealth(artistId);
    }

    if (
      text.includes("draft") &&
      (text.includes("email") ||
        text.includes("outreach") ||
        text.includes("venue"))
    ) {
      return this.runDraftVenueOutreach(
        artistId,
        actorLabel,
        adapters,
        actorOperatorId
      );
    }

    if (
      text.includes("venue") &&
      (text.includes("rank") ||
        text.includes("fit") ||
        text.includes("driving") ||
        text.includes("distance"))
    ) {
      return this.runRankVenuesByFit(artistId, adapters);
    }

    if (text.includes("release") && text.includes("checklist")) {
      return this.runDraftReleaseChecklist(artistId, actorOperatorId);
    }

    if (
      text.includes("enqueue") &&
      (text.includes("research") || text.includes("refresh"))
    ) {
      return this.runStructuredIntent(
        "enqueue_research_refresh",
        artistId,
        actorLabel,
        adapters,
        {},
        actorOperatorId
      );
    }

    if (
      text.includes("research") ||
      text.includes("bandsintown") ||
      text.includes("ticketmaster") ||
      text.includes("show calendar") ||
      text.includes("events in")
    ) {
      return this.runResearchBookingIntel(artistId, adapters, undefined);
    }

    return {
      intent: "unknown",
      result: { message: "No matching intent." }
    };
  }
}
