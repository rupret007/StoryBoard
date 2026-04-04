import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { AuthService } from "./auth.service";

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<FastifyRequest>();
    const session = this.auth.parseSessionFromRequest(req);
    if (!session) {
      throw new UnauthorizedException("Sign in required");
    }
    const op = await this.auth.loadOperatorOrThrow(session.operatorId);
    req.storyboardSession = session;
    req.storyboardOperator = op;
    return true;
  }
}
