import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { MembershipService } from "./membership.service";
import { RolePolicyService } from "./role-policy.service";
import { SessionAuthGuard } from "./session-auth.guard";
import { PrismaModule } from "../prisma/prisma.module";

@Module({
  imports: [PrismaModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    MembershipService,
    RolePolicyService,
    SessionAuthGuard
  ],
  exports: [
    AuthService,
    MembershipService,
    RolePolicyService,
    SessionAuthGuard
  ]
})
export class AuthModule {}
