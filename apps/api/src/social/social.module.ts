import { Module, forwardRef } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ApprovalsModule } from "../approvals/approvals.module";
import { SocialController } from "./social.controller";
import { SocialMediaPublicController } from "./social-media-public.controller";
import { SocialOAuthController } from "./social-oauth.controller";
import { SocialExecutionService } from "./social-execution.service";
import { SocialCaptionService } from "./social-caption.service";
import { SocialMediaService } from "./social-media.service";
import { SocialService } from "./social.service";
import { SOCIAL_SERVICE } from "./social.tokens";

@Module({
  imports: [AuthModule, forwardRef(() => ApprovalsModule)],
  controllers: [SocialController, SocialOAuthController, SocialMediaPublicController],
  providers: [
    SocialMediaService,
    SocialCaptionService,
    SocialExecutionService,
    SocialService,
    { provide: SOCIAL_SERVICE, useExisting: SocialExecutionService }
  ],
  exports: [SocialMediaService, SocialCaptionService, SocialExecutionService, SocialService, SOCIAL_SERVICE]
})
export class SocialModule {}
