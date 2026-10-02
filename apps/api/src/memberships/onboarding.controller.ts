import {
  BadRequestException,
  Body,
  Controller,
  Post,
  Res,
  UseGuards
} from "@nestjs/common";
import type { FastifyReply } from "fastify";
import { CurrentOperator } from "../auth/current-operator.decorator";
import type { RequestOperator } from "../auth/request-operator";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { OnboardingService } from "./onboarding.service";

@Controller("onboarding")
@UseGuards(SessionAuthGuard)
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  @Post("additional-artist")
  async createAdditionalArtist(
    @Body() body: { name?: string; sourceArtistId?: string },
    @CurrentOperator() operator: RequestOperator,
    @Res({ passthrough: true }) reply: FastifyReply
  ) {
    if (typeof body?.name !== "string" || !body.name.trim() ||
        typeof body.sourceArtistId !== "string" || !body.sourceArtistId.trim()) {
      throw new BadRequestException("Band name and current band are required");
    }
    return this.onboarding.createAdditionalArtist({
      operatorId: operator.id, actorLabel: operator.email, name: body.name.trim(),
      sourceArtistId: body.sourceArtistId.trim(), reply
    });
  }

  @Post("artist")
  async createArtist(
    @Body() body: { name?: string; slug?: string },
    @CurrentOperator() operator: RequestOperator,
    @Res({ passthrough: true }) reply: FastifyReply
  ) {
    const name = body?.name;
    if (!name?.trim()) {
      throw new BadRequestException("name required");
    }
    const slug = body.slug?.trim();
    return this.onboarding.createFirstArtist({
      operatorId: operator.id,
      actorLabel: operator.email,
      name: name.trim(),
      ...(slug ? { slug } : {}),
      reply
    });
  }
}
