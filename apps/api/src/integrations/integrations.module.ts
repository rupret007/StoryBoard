import { Global, Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { AuthModule } from "../auth/auth.module";
import { AdapterRegistryResolver } from "./adapter-registry.resolver";
import { buildAdapterRegistry } from "./build-registry";
import { SecretBox } from "./crypto/secret-box";
import { IntegrationsGoogleLinkController } from "./google-oauth.controller";
import { IntegrationsStatusController } from "./integrations-status.controller";

/** @deprecated Prefer thinking of this as the adapter registry; name kept for stable wiring */
export const MOCK_ADAPTERS = "MOCK_ADAPTERS";

@Global()
@Module({
  imports: [ConfigModule, AuthModule],
  controllers: [
    IntegrationsStatusController,
    IntegrationsGoogleLinkController
  ],
  providers: [
    {
      provide: SecretBox,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new SecretBox(config.get<string | undefined>("INTEGRATION_SECRETS_ENCRYPTION_KEY"))
    },
    AdapterRegistryResolver,
    {
      provide: MOCK_ADAPTERS,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        buildAdapterRegistry({
          GOOGLE_CLIENT_ID: config.get<string | undefined>("GOOGLE_CLIENT_ID"),
          GOOGLE_CLIENT_SECRET: config.get<string | undefined>(
            "GOOGLE_CLIENT_SECRET"
          ),
          GOOGLE_OAUTH_REFRESH_TOKEN: config.get<string | undefined>(
            "GOOGLE_OAUTH_REFRESH_TOKEN"
          ),
          GOOGLE_CALENDAR_DEFAULT_ID: config.get<string | undefined>(
            "GOOGLE_CALENDAR_DEFAULT_ID"
          ),
          GOOGLE_DRIVE_ROOT_FOLDER_ID: config.get<string | undefined>(
            "GOOGLE_DRIVE_ROOT_FOLDER_ID"
          ),
          BANDSINTOWN_APP_ID: config.get<string | undefined>(
            "BANDSINTOWN_APP_ID"
          ),
          TICKETMASTER_API_KEY: config.get<string | undefined>(
            "TICKETMASTER_API_KEY"
          )
        })
    }
  ],
  exports: [MOCK_ADAPTERS, AdapterRegistryResolver, SecretBox]
})
export class IntegrationsModule {}
