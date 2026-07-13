import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { QueueModule } from "../queue/queue.module";
import { ApprovalsController } from "./approvals.controller";
import { ApprovalsService } from "./approvals.service";
import { APPROVALS_SERVICE } from "./approvals.tokens";

@Module({
  imports: [AuthModule, QueueModule],
  controllers: [ApprovalsController],
  providers: [ApprovalsService, { provide: APPROVALS_SERVICE, useExisting: ApprovalsService }],
  exports: [ApprovalsService, APPROVALS_SERVICE]
})
export class ApprovalsModule {}
