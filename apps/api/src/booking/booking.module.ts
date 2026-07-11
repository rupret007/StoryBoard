import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ApprovalsModule } from "../approvals/approvals.module";
import { BookingCampaignsController } from "./booking-campaigns.controller";
import { BookingCampaignsService } from "./booking-campaigns.service";
import { BookingMarketSprintsController } from "./booking-market-sprints.controller";
import { BookingMarketSprintsService } from "./booking-market-sprints.service";
import { BookingOpportunitiesController } from "./booking-opportunities.controller";
import { BookingOpportunitiesService } from "./booking-opportunities.service";
import { BookingProfilesController } from "./booking-profiles.controller";
import { BookingProfilesService } from "./booking-profiles.service";
import { BookingProspectsController } from "./booking-prospects.controller";
import { BookingProspectsService } from "./booking-prospects.service";

@Module({
  imports: [AuthModule, ApprovalsModule],
  controllers: [
    BookingOpportunitiesController,
    BookingProfilesController,
    BookingProspectsController,
    BookingCampaignsController,
    BookingMarketSprintsController
  ],
  providers: [
    BookingOpportunitiesService,
    BookingProfilesService,
    BookingProspectsService,
    BookingCampaignsService,
    BookingMarketSprintsService
  ],
  exports: [BookingProfilesService, BookingProspectsService]
})
export class BookingModule {}
