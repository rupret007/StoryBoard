import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class ArtistsService {
  constructor(private readonly prisma: PrismaService) {}

  async getDefaultArtist() {
    const existingDefault = await this.prisma.client.artist.findUnique({
      where: { slug: "default" }
    });
    if (existingDefault) {
      return existingDefault;
    }
    return this.prisma.client.artist.create({
      data: {
        name: "My Artist",
        slug: "default"
      }
    });
  }
}
