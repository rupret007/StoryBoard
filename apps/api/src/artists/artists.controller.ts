import { Controller, Get, UseGuards } from "@nestjs/common";
import { CurrentOperator } from "../auth/current-operator.decorator";
import { MembershipService } from "../auth/membership.service";
import type { RequestOperator } from "../auth/request-operator";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { ArtistsService } from "./artists.service";

@Controller("artists")
@UseGuards(SessionAuthGuard)
export class ArtistsController {
  constructor(
    private readonly artists: ArtistsService,
    private readonly membership: MembershipService
  ) {}

  @Get("default")
  async defaultArtist(@CurrentOperator() operator: RequestOperator) {
    const artist = await this.artists.getDefaultArtist();
    await this.membership.assertMembership(operator.id, artist.id);
    return artist;
  }
}
