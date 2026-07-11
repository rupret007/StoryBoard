import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { FastifyReply, FastifyRequest } from "fastify";
import { google } from "googleapis";
import { PrismaService } from "../prisma/prisma.service";
import type { RequestOperator } from "./request-operator";
import {
  readSessionFromCookieHeader,
  SESSION_COOKIE_NAME,
  type SessionPayloadV1,
  signSessionPayload,
  verifySessionPayload
} from "./session-cookie";
import {
  OPERATOR_OAUTH_STATE_COOKIE,
  OPERATOR_OAUTH_STATE_TTL_SECONDS
} from "./operator-oauth-state";

const SESSION_MS = 30 * 24 * 60 * 60 * 1000;

@Injectable()
export class AuthService {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService
  ) {}

  private sessionSecret(): string {
    return this.config.getOrThrow<string>("SESSION_SECRET");
  }

  parseSessionFromRequest(req: FastifyRequest): SessionPayloadV1 | null {
    const raw = req.headers.cookie;
    return readSessionFromCookieHeader(
      typeof raw === "string" ? raw : undefined,
      this.sessionSecret()
    );
  }

  verifySessionValue(token: string | undefined): SessionPayloadV1 | null {
    return verifySessionPayload(token, this.sessionSecret());
  }

  applySessionCookie(reply: FastifyReply, payload: SessionPayloadV1) {
    const secret = this.sessionSecret();
    const value = signSessionPayload(payload, secret);
    const secure = this.config.get<string>("NODE_ENV") === "production";
    const domain = this.config.get<string>("COOKIE_DOMAIN")?.trim();
    reply.setCookie(SESSION_COOKIE_NAME, value, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure,
      maxAge: Math.floor(SESSION_MS / 1000),
      ...(domain ? { domain } : {})
    });
  }

  clearSessionCookie(reply: FastifyReply) {
    const secure = this.config.get<string>("NODE_ENV") === "production";
    const domain = this.config.get<string>("COOKIE_DOMAIN")?.trim();
    reply.clearCookie(SESSION_COOKIE_NAME, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure,
      ...(domain ? { domain } : {})
    });
  }

  applyOperatorOAuthStateCookie(reply: FastifyReply, state: string) {
    const secure = this.config.get<string>("NODE_ENV") === "production";
    const domain = this.config.get<string>("COOKIE_DOMAIN")?.trim();
    reply.setCookie(OPERATOR_OAUTH_STATE_COOKIE, state, {
      path: "/auth/operator/google/callback",
      httpOnly: true,
      sameSite: "lax",
      secure,
      signed: true,
      maxAge: OPERATOR_OAUTH_STATE_TTL_SECONDS,
      ...(domain ? { domain } : {})
    });
  }

  readOperatorOAuthStateFromRequest(req: FastifyRequest): string | null {
    const raw = req.cookies?.[OPERATOR_OAUTH_STATE_COOKIE];
    if (!raw) {
      return null;
    }
    const unsigned = req.unsignCookie(raw);
    return unsigned.valid ? unsigned.value : null;
  }

  clearOperatorOAuthStateCookie(reply: FastifyReply) {
    const secure = this.config.get<string>("NODE_ENV") === "production";
    const domain = this.config.get<string>("COOKIE_DOMAIN")?.trim();
    reply.clearCookie(OPERATOR_OAUTH_STATE_COOKIE, {
      path: "/auth/operator/google/callback",
      httpOnly: true,
      sameSite: "lax",
      secure,
      ...(domain ? { domain } : {})
    });
  }

  async loadOperatorOrThrow(operatorId: string): Promise<RequestOperator> {
    const op = await this.prisma.client.operator.findUnique({
      where: { id: operatorId }
    });
    if (!op) {
      throw new UnauthorizedException("Session operator not found");
    }
    return { id: op.id, email: op.email, name: op.name };
  }

  async getMe(operatorId: string, session: SessionPayloadV1 | null) {
    const operator = await this.prisma.client.operator.findUnique({
      where: { id: operatorId }
    });
    if (!operator) {
      throw new UnauthorizedException("Operator not found");
    }
    const memberships = await this.prisma.client.artistMembership.findMany({
      where: { operatorId },
      include: { artist: { select: { id: true, name: true, slug: true } } },
      orderBy: { createdAt: "asc" }
    });
    let currentArtistId: string | null = session?.currentArtistId ?? null;
    if (
      currentArtistId &&
      !memberships.some((m) => m.artistId === currentArtistId)
    ) {
      currentArtistId = null;
    }
    return {
      operator: {
        id: operator.id,
        email: operator.email,
        name: operator.name
      },
      memberships: memberships.map((m) => ({
        artistId: m.artistId,
        role: m.role,
        artistName: m.artist.name,
        artistSlug: m.artist.slug
      })),
      currentArtistId
    };
  }

  async setCurrentArtist(
    operatorId: string,
    artistId: string,
    reply: FastifyReply
  ) {
    await this.prisma.client.artistMembership.findUniqueOrThrow({
      where: { operatorId_artistId: { operatorId, artistId } }
    });
    const payload = this.newSessionPayload(operatorId, artistId);
    this.applySessionCookie(reply, payload);
    return { ok: true as const, currentArtistId: artistId };
  }

  newSessionPayload(
    operatorId: string,
    currentArtistId: string | null
  ): SessionPayloadV1 {
    const now = Date.now();
    return {
      v: 1,
      operatorId,
      currentArtistId,
      iat: now,
      exp: now + SESSION_MS
    };
  }

  buildGoogleOperatorAuthUrl(state: string): string {
    const clientId = this.config.get<string | undefined>("GOOGLE_CLIENT_ID");
    const redirectUri = this.config.getOrThrow<string>(
      "GOOGLE_OPERATOR_REDIRECT_URI"
    );
    if (!clientId?.trim() || clientId.includes("replace-me")) {
      throw new ServiceUnavailableException(
        "Google OAuth is not configured for operator login"
      );
    }
    const params = new URLSearchParams({
      client_id: clientId.trim(),
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid email profile",
      access_type: "online",
      prompt: "select_account",
      state
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async completeGoogleOperatorLogin(
    code: string,
    reply: FastifyReply
  ): Promise<RequestOperator> {
    const clientId = this.config.get<string | undefined>("GOOGLE_CLIENT_ID");
    const clientSecret = this.config.get<string | undefined>(
      "GOOGLE_CLIENT_SECRET"
    );
    const redirectUri = this.config.getOrThrow<string>(
      "GOOGLE_OPERATOR_REDIRECT_URI"
    );
    if (
      !clientId?.trim() ||
      !clientSecret?.trim() ||
      clientId.includes("replace-me")
    ) {
      throw new ServiceUnavailableException("Google OAuth is not configured");
    }
    const oauth2 = new google.auth.OAuth2(
      clientId.trim(),
      clientSecret.trim(),
      redirectUri
    );
    let tokens;
    try {
      const exchanged = await oauth2.getToken(code.trim());
      tokens = exchanged.tokens;
    } catch {
      throw new BadRequestException("Google token exchange failed");
    }
    const idToken = tokens.id_token;
    if (!idToken?.trim()) {
      throw new BadRequestException("Missing id_token from Google");
    }
    const ticket = await oauth2.verifyIdToken({
      idToken,
      audience: clientId.trim()
    });
    const payload = ticket.getPayload();
    const sub = payload?.sub?.trim();
    const email = payload?.email?.trim()?.toLowerCase();
    if (!sub || !email) {
      throw new BadRequestException("Google profile missing sub or email");
    }
    const name =
      typeof payload?.name === "string" && payload.name.trim()
        ? payload.name.trim()
        : null;

    const operator = await this.prisma.client.operator.upsert({
      where: { googleSub: sub },
      create: { email, name, googleSub: sub },
      update: { email, name }
    });

    const sessionPayload = this.newSessionPayload(operator.id, null);
    this.applySessionCookie(reply, sessionPayload);
    return { id: operator.id, email: operator.email, name: operator.name };
  }

  /** Resolve operator from session cookie (for integration OAuth callback). */
  async operatorFromRequestCookies(
    req: FastifyRequest
  ): Promise<RequestOperator | null> {
    const session = this.parseSessionFromRequest(req);
    if (!session) {
      return null;
    }
    try {
      return await this.loadOperatorOrThrow(session.operatorId);
    } catch {
      return null;
    }
  }

  async devBypassLogin(reply: FastifyReply): Promise<RequestOperator> {
    if (this.config.get<string>("NODE_ENV") !== "development") {
      throw new BadRequestException("Dev bypass only in development");
    }
    if (!this.config.get<boolean>("AUTH_DEV_BYPASS")) {
      throw new BadRequestException("AUTH_DEV_BYPASS is not enabled");
    }
    const email =
      this.config.get<string | undefined>("SEED_OPERATOR_EMAIL")?.trim() ||
      "dev@localhost";
    let op = await this.prisma.client.operator.findFirst({
      where: { email }
    });
    if (!op) {
      op = await this.prisma.client.operator.create({
        data: { email, name: "Local Dev" }
      });
    }
    const membership = await this.prisma.client.artistMembership.findFirst({
      where: { operatorId: op.id }
    });
    const currentArtistId = membership?.artistId ?? null;
    this.applySessionCookie(reply, this.newSessionPayload(op.id, currentArtistId));
    return { id: op.id, email: op.email, name: op.name };
  }
}
