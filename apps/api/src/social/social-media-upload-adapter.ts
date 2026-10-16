import { FastifyAdapter } from "@nestjs/platform-fastify";

export const SOCIAL_MEDIA_CHUNK_PATH = "/social/media/:id/chunks";
export const SOCIAL_MEDIA_UPLOAD_BODY_LIMIT = 10 * 1024 * 1024;

/** Keep binary parsing and the larger request limit inside the upload route. */
export class SocialMediaUploadAdapter extends FastifyAdapter {
  override put(...args: Parameters<FastifyAdapter["put"]>) {
    if (args[0] !== SOCIAL_MEDIA_CHUNK_PATH) {
      return super.put(...args);
    }

    this.instance.register((upload, _options, done) => {
      upload.addContentTypeParser(
        "application/octet-stream",
        { parseAs: "buffer" },
        (_request, body, parsed) => parsed(null, body)
      );
      upload.addHook("onRoute", (route) => {
        route.bodyLimit = SOCIAL_MEDIA_UPLOAD_BODY_LIMIT;
      });
      // Use Nest's registration so its handler (guards, pipes, interceptors)
      // and route metadata are retained in this encapsulated Fastify scope.
      new FastifyAdapter(upload).put(...args);
      done();
    });
    return this.instance;
  }
}
