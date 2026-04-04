import type { SessionPayloadV1 } from "./session-cookie";

export type RequestOperator = {
  id: string;
  email: string;
  name: string | null;
};

declare module "fastify" {
  interface FastifyRequest {
    storyboardOperator?: RequestOperator;
    storyboardSession?: SessionPayloadV1;
  }
}
