import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { OperationalIntelligenceModule } from "../operational-intelligence/operational-intelligence.module";
import { DashboardController } from "./dashboard.controller";

@Module({
  imports: [AuthModule, OperationalIntelligenceModule],
  controllers: [DashboardController]
})
export class DashboardModule {}
