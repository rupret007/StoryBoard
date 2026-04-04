import { Controller, Get } from "@nestjs/common";
import { getMvpModules } from "@storyboard/shared";

@Controller()
export class AppController {
  @Get("health")
  health() {
    return {
      name: "storyboard-api",
      status: "ok"
    };
  }

  @Get("meta")
  meta() {
    return {
      product: "StoryBoard",
      modules: getMvpModules()
    };
  }
}
