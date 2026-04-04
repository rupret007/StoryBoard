import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { AppController } from "./app.controller";
import { ApprovalsModule } from "./approvals/approvals.module";
import { ArtistsModule } from "./artists/artists.module";
import { AuditEventsModule } from "./audit-events/audit-events.module";
import { AuditModule } from "./audit/audit.module";
import { BookingModule } from "./booking/booking.module";
import { CommandsModule } from "./commands/commands.module";
import { ContactsModule } from "./contacts/contacts.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { GoogleOAuthCallbackModule } from "./integrations/google-oauth-callback.module";
import { IntegrationsModule } from "./integrations/integrations.module";
import { PrismaModule } from "./prisma/prisma.module";
import { TasksModule } from "./tasks/tasks.module";
import { VenuesModule } from "./venues/venues.module";
import { WeeklySummaryModule } from "./summary/weekly-summary.module";
import { validateEnv } from "./config/env.validation";
import { QueueModule } from "./queue/queue.module";
import { AuthModule } from "./auth/auth.module";
import { CsrfOriginGuard } from "./auth/csrf-origin.guard";
import { MembershipsModule } from "./memberships/memberships.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ["../../.env", ".env"],
      validate: validateEnv
    }),
    PrismaModule,
    AuthModule,
    MembershipsModule,
    AuditModule,
    IntegrationsModule,
    ArtistsModule,
    VenuesModule,
    ContactsModule,
    BookingModule,
    TasksModule,
    ApprovalsModule,
    AuditEventsModule,
    CommandsModule,
    WeeklySummaryModule,
    DashboardModule,
    QueueModule,
    GoogleOAuthCallbackModule
  ],
  controllers: [AppController],
  providers: [{ provide: APP_GUARD, useClass: CsrfOriginGuard }]
})
export class AppModule {}
