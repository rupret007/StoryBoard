import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Queue, Worker } from "bullmq";
import Redis from "ioredis";
import { WorkflowJobProcessorService } from "../workflow-automation/workflow-job-processor.service";

export const STORYBOARD_ENRICHMENT_QUEUE = "storyboard-enrichment";

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
const ONE_DAY_MS = 86400000;
const SEVEN_DAYS_MS = 7 * ONE_DAY_MS;

@Injectable()
export class StoryboardQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(StoryboardQueueService.name);
  private connection?: Redis;
  private worker?: Worker;
  /** Present when worker is enabled */
  queue?: Queue;

  constructor(
    private readonly config: ConfigService,
    private readonly jobProcessor: WorkflowJobProcessorService
  ) {}

  onModuleInit() {
    const url = this.config.getOrThrow<string>("REDIS_URL");
    this.connection = new Redis(url, { maxRetriesPerRequest: null });
    this.queue = new Queue(STORYBOARD_ENRICHMENT_QUEUE, {
      connection: this.connection
    });

    const repeatMs =
      this.config.get<number>("WORKFLOW_AUTOMATION_REPEAT_MS") ?? SIX_HOURS_MS;
    const digestDailyMs =
      this.config.get<number>("WORKFLOW_DIGEST_DAILY_MS") ?? ONE_DAY_MS;
    const digestWeeklyMs =
      this.config.get<number>("WORKFLOW_DIGEST_WEEKLY_MS") ?? SEVEN_DAYS_MS;

    if (this.config.get<string>("ENABLE_QUEUE_WORKER") !== "false") {
      void this.queue
        .add(
          "task.check-overdue",
          {},
          {
            repeat: { every: repeatMs },
            jobId: "repeat-task-check-overdue"
          }
        )
        .catch((e) =>
          this.log.warn(`schedule task.check-overdue failed: ${String(e)}`)
        );
      void this.queue
        .add(
          "followup.check-stale",
          {},
          {
            repeat: { every: repeatMs },
            jobId: "repeat-followup-check-stale"
          }
        )
        .catch((e) =>
          this.log.warn(`schedule followup.check-stale failed: ${String(e)}`)
        );
      void this.queue
        .add(
          "urgent.telegram.scan",
          {},
          {
            repeat: { every: repeatMs },
            jobId: "repeat-urgent-telegram-scan"
          }
        )
        .catch((e) =>
          this.log.warn(`schedule urgent.telegram.scan failed: ${String(e)}`)
        );
      void this.queue
        .add(
          "digest.generate.daily",
          {},
          {
            repeat: { every: digestDailyMs },
            jobId: "repeat-digest-daily"
          }
        )
        .catch((e) =>
          this.log.warn(`schedule digest.generate.daily failed: ${String(e)}`)
        );
      void this.queue
        .add(
          "digest.generate.weekly",
          {},
          {
            repeat: { every: digestWeeklyMs },
            jobId: "repeat-digest-weekly"
          }
        )
        .catch((e) =>
          this.log.warn(`schedule digest.generate.weekly failed: ${String(e)}`)
        );
    }

    if (this.config.get<string>("ENABLE_QUEUE_WORKER") === "false") {
      return;
    }
    this.worker = new Worker(
      STORYBOARD_ENRICHMENT_QUEUE,
      async (job) => this.jobProcessor.process(job),
      { connection: this.connection }
    );
  }

  async enqueueVenueEnrich(venueId: string) {
    if (!this.queue) {
      return;
    }
    await this.queue.add("venue.enrich", { venueId });
  }

  async enqueueResearchRefresh(artistId: string, city?: string) {
    if (!this.queue) {
      return;
    }
    await this.queue.add("research.refresh", { artistId, city });
  }

  async enqueueInviteSend(input: {
    inviteId: string;
    artistId: string;
    acceptUrl: string;
    inviteeEmail: string;
    artistName: string;
    role: string;
  }) {
    if (!this.queue) {
      return;
    }
    await this.queue.add(
      "invite.send",
      { ...input },
      { jobId: `invite:${input.inviteId}` }
    );
  }

  async enqueueApprovalNotify(input: {
    artistId: string;
    approvalId: string;
    event: "created" | "approved" | "rejected" | "executed" | "failed";
  }) {
    if (!this.queue) {
      return;
    }
    await this.queue.add("approval.notify", input, {
      jobId: `approval:${input.approvalId}:${input.event}:${Date.now()}`
    });
  }

  async enqueueMembershipInviteAccepted(input: {
    artistId: string;
    inviteeEmail: string;
    role: string;
  }) {
    if (!this.queue) {
      return;
    }
    await this.queue.add("membership.invite_accepted", input);
  }

  async enqueueIntegrationConnectionChanged(input: {
    artistId: string;
    provider: string;
  }) {
    if (!this.queue) {
      return;
    }
    await this.queue.add("integration.connection_changed", input);
  }

  readiness() {
    return {
      redis: this.connection?.status === "ready",
      workerEnabled: this.config.get<string>("ENABLE_QUEUE_WORKER") !== "false",
      workerRunning: Boolean(this.worker)
    };
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue?.close();
    await this.connection?.quit();
  }
}
