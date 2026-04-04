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
    credentials: true
  });

  await app.register(cookie, {
    secret: config.getOrThrow<string>("SESSION_SECRET")
  });

  const port = config.getOrThrow<number>("API_PORT");
  await app.listen(port, "0.0.0.0");
}

bootstrap();
