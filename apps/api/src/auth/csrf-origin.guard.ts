import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { FastifyRequest } from "fastify";

@Injectable()
export class CsrfOriginGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<FastifyRequest>();
    const method = (req.method ?? "GET").toUpperCase();
    if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
      return true;
    }

    const path = String(String(req.url ?? "").split("?")[0] ?? "");
    if (
      path.startsWith("/auth/operator/google/callback") ||
      path.startsWith("/auth/google/callback") ||
      path.startsWith("/auth/dev/login") ||
      path.startsWith("/integrations/telegram/webhook")
    ) {
      return true;
    }

    const nodeEnv = this.config.get<string>("NODE_ENV") ?? "development";
    const webUrl = this.config.getOrThrow<string>("WEB_URL");
    let webOrigin: string;
    try {
      webOrigin = new URL(webUrl).origin;
    } catch {
      throw new ForbiddenException("WEB_URL misconfigured");
    }

    const allowed = new Set<string>([webOrigin]);
    if (nodeEnv !== "production") {
      allowed.add("http://localhost:3000");
    }

    const origin = req.headers.origin;
    const referer = req.headers.referer;
    const candidates: string[] = [];
    if (typeof origin === "string" && origin.trim()) {
      candidates.push(origin.trim());
    }
    if (typeof referer === "string" && referer.trim()) {
      try {
        candidates.push(new URL(referer.trim()).origin);
      } catch {
        /* ignore malformed referer */
      }
    }

    if (candidates.length === 0) {
      if (nodeEnv !== "production") {
        return true;
      }
      throw new ForbiddenException("Origin or Referer required for mutating requests");
    }

    for (const o of candidates) {
      if (allowed.has(o)) {
        return true;
      }
    }
    throw new ForbiddenException("Cross-origin request denied");
  }
}
