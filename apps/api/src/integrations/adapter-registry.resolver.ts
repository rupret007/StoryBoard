import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import type { StoryboardAdapterRegistry } from "./adapters/adapter.types";
import { buildAdapterRegistry, cred, type IntegrationEnvSlice } from "./build-registry";
import { SecretBox } from "./crypto/secret-box";
import type { GoogleAuthForRegistry } from "./google-auth.types";
import type { GoogleStoredSecretsV1 } from "./google-stored-secrets";
import { GOOGLE_CONNECTION_PROVIDER } from "./google-oauth.constants";

@Injectable()
export class AdapterRegistryResolver {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly secretBox: SecretBox
  ) {}

  private envSlice(): IntegrationEnvSlice {
    return {
      GOOGLE_CLIENT_ID: this.config.get<string | undefined>("GOOGLE_CLIENT_ID"),
      GOOGLE_CLIENT_SECRET: this.config.get<string | undefined>(
        "GOOGLE_CLIENT_SECRET"
      ),
      GOOGLE_OAUTH_REFRESH_TOKEN: this.config.get<string | undefined>(
        "GOOGLE_OAUTH_REFRESH_TOKEN"
      ),
      GOOGLE_CALENDAR_DEFAULT_ID: this.config.get<string | undefined>(
        "GOOGLE_CALENDAR_DEFAULT_ID"
      ),
      GOOGLE_DRIVE_ROOT_FOLDER_ID: this.config.get<string | undefined>(
        "GOOGLE_DRIVE_ROOT_FOLDER_ID"
      ),
      BANDSINTOWN_APP_ID: this.config.get<string | undefined>(
        "BANDSINTOWN_APP_ID"
      ),
      BANDSINTOWN_EVENT_ARTIST: this.config.get<string | undefined>(
        "BANDSINTOWN_EVENT_ARTIST"
      ),
      TICKETMASTER_API_KEY: this.config.get<string | undefined>(
        "TICKETMASTER_API_KEY"
      )
    };
  }

  async resolveForArtist(artistId: string): Promise<StoryboardAdapterRegistry> {
    const env = this.envSlice();
    const override = await this.googleOverrideForArtist(artistId, env);
    if (override) {
      return buildAdapterRegistry(env, override);
    }
    return buildAdapterRegistry(env);
  }

  private async googleOverrideForArtist(
    artistId: string,
    env: IntegrationEnvSlice
  ): Promise<GoogleAuthForRegistry | null> {
    const row = await this.prisma.client.integrationConnection.findUnique({
      where: {
        artistId_provider: {
          artistId,
          provider: GOOGLE_CONNECTION_PROVIDER
        }
      }
    });
    if (
      row?.status !== "active" ||
      !row.encryptedSecrets ||
      !this.secretBox.configured() ||
      !cred(env.GOOGLE_CLIENT_ID) ||
      !cred(env.GOOGLE_CLIENT_SECRET)
    ) {
      return null;
    }
    const wrap = row.encryptedSecrets as { blob?: string };
    if (typeof wrap?.blob !== "string") {
      return null;
    }
    try {
      const secrets = this.secretBox.decryptJson<GoogleStoredSecretsV1>(
        wrap.blob
      );
      if (!cred(secrets.refreshToken)) {
        return null;
      }
      const cal =
        cred(env.GOOGLE_CALENDAR_DEFAULT_ID) &&
        env.GOOGLE_CALENDAR_DEFAULT_ID!.trim() !== ""
          ? env.GOOGLE_CALENDAR_DEFAULT_ID!.trim()
          : "primary";
      return {
        clientId: env.GOOGLE_CLIENT_ID!,
        clientSecret: env.GOOGLE_CLIENT_SECRET!,
        refreshToken: secrets.refreshToken.trim(),
        scopes: row.scopes?.length ? [...row.scopes] : [],
        calendarId: cal,
        ...(cred(env.GOOGLE_DRIVE_ROOT_FOLDER_ID)
          ? { driveRootFolderId: env.GOOGLE_DRIVE_ROOT_FOLDER_ID!.trim() }
          : {})
      };
    } catch {
      return null;
    }
  }
}
