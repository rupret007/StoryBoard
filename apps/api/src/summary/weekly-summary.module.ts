import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { WeeklySummaryController } from "./weekly-summary.controller";
import { WeeklySummaryService } from "./weekly-summary.service";

@Module({
  imports: [AuthModule],
  controllers: [WeeklySummaryController],
  providers: [WeeklySummaryService]
})
export class WeeklySummaryModule {}
