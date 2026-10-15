import { Module, forwardRef } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ApprovalsModule } from "../approvals/approvals.module";
import { SocialController } from "./social.controller";
import { SocialOAuthController } from "./social-oauth.controller";
import { SocialExecutionService } from "./social-execution.service";
import { SocialService } from "./social.service";
import { SOCIAL_SERVICE } from "./social.tokens";

@Module({
  imports: [AuthModule, forwardRef(() => ApprovalsModule)],
  controllers: [SocialController, SocialOAuthController],
  providers: [
    SocialExecutionService,
    SocialService,
    { provide: SOCIAL_SERVICE, useExisting: SocialExecutionService }
  ],
  exports: [SocialExecutionService, SocialService, SOCIAL_SERVICE]
})
export class SocialModule {}
