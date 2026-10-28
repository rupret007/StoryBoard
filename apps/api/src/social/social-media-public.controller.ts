import { Controller, Get, Param, Res } from "@nestjs/common";
import type { FastifyReply } from "fastify";
import { SocialMediaService } from "./social-media.service";

/** Tokenized file URL so Instagram can pull a hosted image when API_URL is public https. */
@Controller("social/media")
export class SocialMediaPublicController {
  constructor(private readonly media: SocialMediaService) {}

  @Get(":id/public/:token")
  async publicFile(
    @Param("id") id: string,
    @Param("token") token: string,
    @Res({ passthrough: false }) reply: FastifyReply
  ) {
    const file = await this.media.openPublic(id, token);
    return reply
      .header("Content-Type", file.mimeType)
      .header("X-Content-Type-Options", "nosniff")
      .header("Content-Security-Policy", "sandbox")
      .header("Content-Length", String(file.byteSize))
      .header("Cache-Control", "private, max-age=3600")
      .send(file.stream);
  }
}
