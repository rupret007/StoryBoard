import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { BookingOpportunitiesController } from "./booking-opportunities.controller";
import { BookingOpportunitiesService } from "./booking-opportunities.service";

@Module({
  imports: [AuthModule],
  controllers: [BookingOpportunitiesController],
  providers: [BookingOpportunitiesService]
})
export class BookingModule {}
