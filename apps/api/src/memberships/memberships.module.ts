import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../prisma/prisma.module";
import { QueueModule } from "../queue/queue.module";
import { InvitesService } from "./invites.service";
import { MembershipsAdminService } from "./memberships-admin.service";
import { MembershipsController } from "./memberships.controller";
import { OnboardingController } from "./onboarding.controller";
import { OnboardingService } from "./onboarding.service";

@Module({
  imports: [PrismaModule, AuthModule, ConfigModule, QueueModule],
  controllers: [MembershipsController, OnboardingController],
  providers: [InvitesService, MembershipsAdminService, OnboardingService]
})
export class MembershipsModule {}
