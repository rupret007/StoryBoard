import "reflect-metadata";
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const dir = dirname(fileURLToPath(import.meta.url));
const controllerMod = await import(
  pathToFileURL(join(dir, "..", "dist", "app.controller.js")).href
);

test("readiness reports each dependency without exposing configuration", async () => {
  const controller = new controllerMod.AppController(
    { client: { $queryRawUnsafe: async () => [{ "?column?": 1 }] } },
    {
      readiness: () => ({
        redis: true,
        workerEnabled: false,
        workerRunning: false
      })
    }
  );

  assert.deepEqual(await controller.ready(), {
    name: "storyboard-api",
    status: "ready",
    database: true,
    redis: true,
    workerEnabled: false,
    workerRunning: false
  });
});

test("readiness returns 503 when a required dependency is unavailable", async () => {
  const controller = new controllerMod.AppController(
    { client: { $queryRawUnsafe: async () => { throw new Error("offline"); } } },
    {
      readiness: () => ({
        redis: false,
        workerEnabled: true,
        workerRunning: false
      })
    }
  );

  await assert.rejects(
    () => controller.ready(),
    (error) =>
      error?.getStatus?.() === 503 &&
      error?.getResponse?.().status === "not_ready" &&
      error?.getResponse?.().database === false &&
      error?.getResponse?.().redis === false
  );
});
