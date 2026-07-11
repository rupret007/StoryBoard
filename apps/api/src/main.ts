import "reflect-metadata";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify";
import { AppModule } from "./app.module";
import "./auth/request-operator";

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter()
  );

  const config = app.get(ConfigService);
  const webUrl = config.getOrThrow<string>("WEB_URL");
  const corsOrigins = Array.from(new Set([webUrl, "http://localhost:3000"]));

  await app.register(cors, {
    origin: corsOrigins,
    credentials: true,
    // The web app is intentionally a separate origin in local development and
    // production deployments. Its API workflows use PATCH and PUT as well as
    // the browser defaults, so the preflight policy must match the API surface.
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
  });

  await app.register(cookie, {
    secret: config.getOrThrow<string>("SESSION_SECRET")
  });

  const port = config.getOrThrow<number>("API_PORT");
  await app.listen(port, "0.0.0.0");
}

bootstrap();
