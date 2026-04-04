import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import type { RequestOperator } from "./request-operator";

export const CurrentOperator = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestOperator => {
    const req = ctx.switchToHttp().getRequest<FastifyRequest>();
    const op = req.storyboardOperator;
    if (!op) {
      throw new Error("CurrentOperator used without SessionAuthGuard");
    }
    return op;
  }
);
