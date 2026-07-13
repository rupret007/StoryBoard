import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ApprovalsModule } from "../approvals/approvals.module";
import { ManagerController } from "./manager.controller";
import { ManagerService } from "./manager.service";

@Module({ imports: [AuthModule, ApprovalsModule], controllers: [ManagerController], providers: [ManagerService], exports: [ManagerService] })
export class ManagerModule {}
