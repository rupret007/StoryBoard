import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ApprovalsModule } from "../approvals/approvals.module";
import { CommandsController } from "./commands.controller";
import { CommandsService } from "./commands.service";
import { QueueModule } from "../queue/queue.module";
import { TasksModule } from "../tasks/tasks.module";

@Module({
  imports: [AuthModule, ApprovalsModule, TasksModule, QueueModule],
  controllers: [CommandsController],
  providers: [CommandsService]
})
export class CommandsModule {}
