import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AuditEventsController } from "./audit-events.controller";

@Module({
  imports: [AuthModule],
  controllers: [AuditEventsController]
})
export class AuditEventsModule {}
