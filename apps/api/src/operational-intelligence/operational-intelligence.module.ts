import { Module } from "@nestjs/common";
import { TasksModule } from "../tasks/tasks.module";
import { OperationalIntelligenceService } from "./operational-intelligence.service";

@Module({
  imports: [TasksModule],
  providers: [OperationalIntelligenceService],
  exports: [OperationalIntelligenceService]
})
export class OperationalIntelligenceModule {}
