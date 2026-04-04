import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Post,
  Req,
  UseGuards
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { CurrentOperator } from "../auth/current-operator.decorator";
import { MembershipService } from "../auth/membership.service";
import { RolePolicyService } from "../auth/role-policy.service";
import type { RequestOperator } from "../auth/request-operator";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { executeCommandBodySchema } from "./execute-command.schema";
import { CommandsService } from "./commands.service";

@Controller("commands")
@UseGuards(SessionAuthGuard)
export class CommandsController {
  constructor(
    private readonly commands: CommandsService,
    private readonly membership: MembershipService,
    private readonly roles: RolePolicyService
  ) {}

  @Post("execute")
  async execute(
    @Body() body: unknown,
    @CurrentOperator() operator: RequestOperator,
    @Req() req: FastifyRequest,
    @Headers("x-artist-id") artistHeader?: string
  ) {
    const artistId = await this.membership.resolveArtistId(
      operator.id,
      req.storyboardSession ?? null,
      artistHeader
    );
    await this.roles.assertCanMutateWorkflow(operator.id, artistId);
    const parsed = executeCommandBodySchema.safeParse(body ?? {});
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.commands.execute(
      artistId,
      parsed.data,
      operator.email,
      operator.id
    );
  }
}
