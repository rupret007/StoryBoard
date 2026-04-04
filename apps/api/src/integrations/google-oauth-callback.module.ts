import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { QueueModule } from "../queue/queue.module";
import { GoogleOAuthCallbackController } from "./google-oauth-callback.controller";

@Module({
  imports: [AuthModule, QueueModule],
  controllers: [GoogleOAuthCallbackController]
})
export class GoogleOAuthCallbackModule {}
