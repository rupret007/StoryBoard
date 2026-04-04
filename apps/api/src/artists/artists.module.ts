import { Global, Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ArtistsController } from "./artists.controller";
import { ArtistsService } from "./artists.service";

@Global()
@Module({
  imports: [AuthModule],
  controllers: [ArtistsController],
  providers: [ArtistsService],
  exports: [ArtistsService]
})
export class ArtistsModule {}
