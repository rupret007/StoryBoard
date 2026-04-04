import { Injectable, OnModuleDestroy } from "@nestjs/common";
import type { PrismaClient } from "../generated/prisma/client";
import { createPrismaClient } from "../lib/prisma";

@Injectable()
export class PrismaService implements OnModuleDestroy {
  readonly client: PrismaClient;

  constructor() {
    this.client = createPrismaClient();
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }
}
