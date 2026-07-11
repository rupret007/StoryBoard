import { Module } from "@nestjs/common";
import { ApprovalsModule } from "../approvals/approvals.module";
import { AuthModule } from "../auth/auth.module";
import { DealsController, DocumentTemplatesController, EventsController, ExpensesController, InvoicesController, ProjectsController, SetlistsController, SettlementsController, SongsController } from "./operations.controller";
import { OperationsService } from "./operations.service";

@Module({ imports: [AuthModule, ApprovalsModule], controllers: [EventsController, SongsController, SetlistsController, ProjectsController, DealsController, DocumentTemplatesController, InvoicesController, ExpensesController, SettlementsController], providers: [OperationsService], exports: [OperationsService] })
export class OperationsModule {}
