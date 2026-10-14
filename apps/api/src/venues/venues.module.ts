import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { BookingModule } from "../booking/booking.module";
import { TasksModule } from "../tasks/tasks.module";
import { VenueBookingService } from "./venue-booking.service";
import { VenuesController } from "./venues.controller";
import { VenuesService } from "./venues.service";

@Module({
  imports: [AuthModule, BookingModule, TasksModule],
  controllers: [VenuesController],
  providers: [VenuesService, VenueBookingService]
})
export class VenuesModule {}
