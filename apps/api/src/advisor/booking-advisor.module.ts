import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AuditModule } from "../audit/audit.module";
import { BookingAdvisorController } from "./booking-advisor.controller";
import { BookingAdvisorService } from "./booking-advisor.service";

@Module({ imports: [AuthModule, AuditModule], controllers: [BookingAdvisorController], providers: [BookingAdvisorService] })
export class BookingAdvisorModule {}
