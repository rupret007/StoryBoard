import { Controller, Get, Query, Req, UseGuards } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { FastifyRequest } from "fastify";
import { CurrentOperator } from "../auth/current-operator.decorator";
import { MembershipService } from "../auth/membership.service";
import type { RequestOperator } from "../auth/request-operator";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { PrismaService } from "../prisma/prisma.service";
import { AdapterRegistryResolver } from "./adapter-registry.resolver";
import { cred, providerModes } from "./build-registry";
import { GOOGLE_CONNECTION_PROVIDER } from "./google-oauth.constants";

@Controller("integrations")
@UseGuards(SessionAuthGuard)
export class IntegrationsStatusController {
  constructor(
    private readonly config: ConfigService,
    private readonly resolver: AdapterRegistryResolver,
    private readonly membership: MembershipService,
    private readonly prisma: PrismaService
  ) {}

  @Get("status")
  async status(
    @CurrentOperator() operator: RequestOperator,
    @Req() req: FastifyRequest,
    @Query("artistId") artistId?: string
  ) {
    const id = await this.membership.resolveArtistId(
      operator.id,
      req.storyboardSession ?? null,
      undefined,
      artistId
    );

    const [registry, conn] = await Promise.all([
      this.resolver.resolveForArtist(id),
      this.prisma.client.integrationConnection.findUnique({
        where: {
          artistId_provider: {
            artistId: id,
            provider: GOOGLE_CONNECTION_PROVIDER
          }
        }
      })
    ]);

    const c = this.config;
    const gmailEnvReady =
      cred(c.get<string>("GOOGLE_CLIENT_ID")) &&
      cred(c.get<string>("GOOGLE_CLIENT_SECRET")) &&
      cred(c.get<string>("GOOGLE_OAUTH_REFRESH_TOKEN"));
    const bitReady = cred(c.get<string>("BANDSINTOWN_APP_ID"));
    const tmReady = cred(c.get<string>("TICKETMASTER_API_KEY"));

    return {
      artistId: id,
      providers: providerModes(registry),
      googleConnection: {
        status: conn?.status ?? "absent",
        provider: GOOGLE_CONNECTION_PROVIDER,
        scopes: conn?.scopes ?? [],
        accountLabel: conn?.accountLabel ?? null,
        hasEncryptedSecrets: Boolean(conn?.encryptedSecrets)
      },
      envHints: {
        gmail: gmailEnvReady,
        bandsintown: bitReady,
        ticketmaster: tmReady,
        bandsintownEventArtistConfigured: cred(
          c.get<string>("BANDSINTOWN_EVENT_ARTIST")
        )
      }
    };
  }
}
