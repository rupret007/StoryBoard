import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AuditModule } from "../audit/audit.module";
import { OperationalIntelligenceModule } from "../operational-intelligence/operational-intelligence.module";
import { TasksModule } from "../tasks/tasks.module";
import { MembershipNotifyTargetsService } from "./membership-notify-targets.service";
import { WorkflowEmailService } from "./workflow-email.service";
import { WorkflowJobProcessorService } from "./workflow-job-processor.service";
import { WorkflowNotificationService } from "./workflow-notification.service";
import { WorkflowNotificationsController } from "./workflow-notifications.controller";
import { WorkflowNotifyPreferenceService } from "./workflow-notify-preference.service";
import { WorkflowSettingsController } from "./workflow-settings.controller";
import { TelegramRegistrationService } from "./telegram-registration.service";
import { TelegramWebhookController } from "./telegram-webhook.controller";
import { WorkflowTelegramService } from "./workflow-telegram.service";

@Module({
  imports: [AuditModule, TasksModule, AuthModule, OperationalIntelligenceModule],
  controllers: [
    WorkflowNotificationsController,
    WorkflowSettingsController,
    TelegramWebhookController
  ],
  providers: [
    MembershipNotifyTargetsService,
    WorkflowNotificationService,
    WorkflowEmailService,
    WorkflowNotifyPreferenceService,
    WorkflowJobProcessorService,
    WorkflowTelegramService,
    TelegramRegistrationService
  ],
  exports: [
    MembershipNotifyTargetsService,
    WorkflowNotificationService,
    WorkflowEmailService,
    WorkflowNotifyPreferenceService,
    WorkflowJobProcessorService,
    WorkflowTelegramService,
    TelegramRegistrationService
  ]
})
export class WorkflowAutomationModule {}
