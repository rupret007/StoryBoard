import { BadRequestException, Injectable } from "@nestjs/common";
import type { ArtistBookingProfileInput } from "@storyboard/shared";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";

export type BookingProfileReadiness = {
  ready: boolean;
  missing: string[];
};

@Injectable()
export class BookingProfilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  private readiness(profile: {
    homeCity: string | null;
    genres: string[];
    targetCapacityMin: number | null;
    targetCapacityMax: number | null;
    bookingPitch: string | null;
  } | null): BookingProfileReadiness {
    const missing: string[] = [];
    if (!profile?.homeCity?.trim()) missing.push("home market");
    if (!profile?.genres?.length) missing.push("at least one genre");
    if (
      profile?.targetCapacityMin == null ||
      profile.targetCapacityMax == null
    ) {
      missing.push("target capacity range");
    }
    if (!profile?.bookingPitch?.trim()) missing.push("booking pitch");
    return { ready: missing.length === 0, missing };
  }

  async get(artistId: string) {
    const profile = await this.prisma.client.artistBookingProfile.findUnique({
      where: { artistId }
    });
    return { profile, ...this.readiness(profile) };
  }

  async assertReady(artistId: string) {
    const profile = await this.prisma.client.artistBookingProfile.findUnique({
      where: { artistId }
    });
    const readiness = this.readiness(profile);
    if (!profile || !readiness.ready) {
      throw new BadRequestException(
        `Complete the booking profile before continuing: ${readiness.missing.join(", ") || "booking profile"}.`
      );
    }
    return profile;
  }

  async put(
    artistId: string,
    data: ArtistBookingProfileInput,
    actorLabel?: string | null,
    actorOperatorId?: string | null
  ) {
    const genres = data.genres
      ? [...new Set(data.genres.map((genre) => genre.trim()))]
      : undefined;
    const create = {
      artistId,
      homeCity: data.homeCity ?? null,
      homeRegion: data.homeRegion ?? null,
      homeCountry: data.homeCountry ?? null,
      genres: genres ?? [],
      targetCapacityMin: data.targetCapacityMin ?? null,
      targetCapacityMax: data.targetCapacityMax ?? null,
      bookingPitch: data.bookingPitch ?? null,
      pressKitUrl: data.pressKitUrl ?? null,
      liveVideoUrl: data.liveVideoUrl ?? null
    };
    const update = {
      ...(data.homeCity !== undefined ? { homeCity: data.homeCity } : {}),
      ...(data.homeRegion !== undefined ? { homeRegion: data.homeRegion } : {}),
      ...(data.homeCountry !== undefined
        ? { homeCountry: data.homeCountry }
        : {}),
      ...(genres !== undefined ? { genres } : {}),
      ...(data.targetCapacityMin !== undefined
        ? { targetCapacityMin: data.targetCapacityMin }
        : {}),
      ...(data.targetCapacityMax !== undefined
        ? { targetCapacityMax: data.targetCapacityMax }
        : {}),
      ...(data.bookingPitch !== undefined ? { bookingPitch: data.bookingPitch } : {}),
      ...(data.pressKitUrl !== undefined ? { pressKitUrl: data.pressKitUrl } : {}),
      ...(data.liveVideoUrl !== undefined ? { liveVideoUrl: data.liveVideoUrl } : {})
    };
    const profile = await this.prisma.client.artistBookingProfile.upsert({
      where: { artistId },
      create,
      update
    });
    const readiness = this.readiness(profile);
    await this.audit.log({
      artistId,
      aggregateType: "ArtistBookingProfile",
      aggregateId: profile.id,
      action: "booking_profile.saved",
      actorLabel,
      actorOperatorId: actorOperatorId ?? null,
      metadata: { ready: readiness.ready, updatedFields: Object.keys(data) }
    });
    return { profile, ...readiness };
  }
}
