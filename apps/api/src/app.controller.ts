import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { getMvpModules } from "@storyboard/shared";
import { PrismaService } from "./prisma/prisma.service";
import { StoryboardQueueService } from "./queue/storyboard-queue.service";

@Controller()
export class AppController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: StoryboardQueueService
  ) {}
  @Get("health")
  health() {
    return {
      name: "storyboard-api",
      status: "ok"
    };
  }

  @Get("ready")
  async ready() {
    let database = false;
    try {
      await this.prisma.client.$queryRawUnsafe("SELECT 1");
      database = true;
    } catch {
      database = false;
    }
    const queue = this.queue.readiness();
    if (!database || !queue.redis) {
      throw new ServiceUnavailableException({
        status: "not_ready",
        database,
        redis: queue.redis,
        workerEnabled: queue.workerEnabled,
        workerRunning: queue.workerRunning
      });
    }
    return {
      name: "storyboard-api",
      status: "ready",
      database,
      redis: queue.redis,
      workerEnabled: queue.workerEnabled,
      workerRunning: queue.workerRunning
    };
  }

  @Get("meta")
  meta() {
    return {
      product: "StoryBoard",
      modules: getMvpModules()
    };
  }
}
