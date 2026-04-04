import { Module } from "@nestjs/common";
import { WorkflowAutomationModule } from "../workflow-automation/workflow-automation.module";
import { StoryboardQueueService } from "./storyboard-queue.service";

@Module({
  imports: [WorkflowAutomationModule],
  providers: [StoryboardQueueService],
  exports: [StoryboardQueueService]
})
export class QueueModule {}
