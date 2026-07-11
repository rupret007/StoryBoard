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
import { BookingRepliesController } from "./booking-replies.controller";
import { BookingRepliesService } from "./booking-replies.service";
import { BOOKING_REPLIES_SYNC } from "./booking-replies.tokens";

@Module({
  imports: [AuthModule, ApprovalsModule],
  controllers: [
    BookingOpportunitiesController,
    BookingProfilesController,
    BookingProspectsController,
    BookingCampaignsController,
    BookingMarketSprintsController,
    BookingRepliesController
  ],
  providers: [
    BookingOpportunitiesService,
    BookingProfilesService,
    BookingProspectsService,
    BookingCampaignsService,
    BookingMarketSprintsService,
    BookingRepliesService,
    { provide: BOOKING_REPLIES_SYNC, useExisting: BookingRepliesService }
  ],
  exports: [BookingProfilesService, BookingProspectsService, BookingRepliesService, BOOKING_REPLIES_SYNC]
})
export class BookingModule {}
