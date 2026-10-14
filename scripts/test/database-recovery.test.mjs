import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync, writeSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { backupDatabase, parseArguments, privateArchivePath, recoveryConnection, restoreDatabase, runPostgresTool } from "../database-recovery.mjs";

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), "storyboard-recovery-test-"));
  const root = join(dir, "repository");
  const privateDir = join(dir, "private");
  mkdirSync(root, { mode: 0o700 }); mkdirSync(privateDir, { mode: 0o700 });
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return { root, privateDir, path: join(privateDir, "band.dump") };
}

const sourceEnv = { DATABASE_URL: "postgresql://operator:private-password@localhost/storyboard?schema=public" };
const targetEnv = { STORYBOARD_RESTORE_DATABASE_URL: "postgresql://operator:private-password@localhost/storyboard_restore_test_drill" };
const restoreOptions = (path) => ({ "--input": path, "--confirm-disposable": "storyboard_restore_test_drill" });
const dumpRun = (_connection, tool, _args, io) => { if (tool === "pg_dump") writeSync(io.outputFd, "PGDMP synthetic private records"); return ""; };

test("restore refuses ambient production URL, wrong database names and mismatched confirmation before any call", async (t) => {
  const { root, path } = fixture(t);
  for (const env of [sourceEnv, { STORYBOARD_RESTORE_DATABASE_URL: "postgresql://operator:secret@localhost/storyboard" }, { STORYBOARD_RESTORE_DATABASE_URL: "postgresql://operator:secret@localhost/storyboard_restore_test_other" }]) {
    let calls = 0;
    await assert.rejects(restoreDatabase(restoreOptions(path), { root, env, run() { calls++; } }));
    assert.equal(calls, 0);
  }
});

test("archive and manifest stay private, contain no credentials, and existing backups cannot be overwritten", async (t) => {
  const { root, path } = fixture(t);
  await backupDatabase({ "--output": path }, { root, env: sourceEnv, run: dumpRun });
  assert.equal(statSync(path).mode & 0o777, 0o600);
  assert.equal(statSync(`${path}.json`).mode & 0o777, 0o600);
  assert.doesNotMatch(readFileSync(`${path}.json`, "utf8"), /private-password|postgresql|operator/);
  await assert.rejects(backupDatabase({ "--output": path }, { root, env: sourceEnv, run: dumpRun }), /already exists/);
  assert.equal(readFileSync(path, "utf8"), "PGDMP synthetic private records");
});

test("failed dump removes its partial archive without writing a success manifest", async (t) => {
  const { root, path } = fixture(t);
  await assert.rejects(backupDatabase({ "--output": path }, { root, env: sourceEnv, run() { throw new Error("failed"); } }), /failed/);
  assert.equal(existsSync(path), false);
  assert.equal(existsSync(`${path}.json`), false);
});

test("tampering is detected before database access; nonempty targets never reach pg_restore", async (t) => {
  const { root, path } = fixture(t);
  await backupDatabase({ "--output": path }, { root, env: sourceEnv, run: dumpRun });
  const calls = [];
  await assert.rejects(restoreDatabase(restoreOptions(path), { root, env: targetEnv, run(_c, tool) { calls.push(tool); return "1"; } }), /not empty/);
  assert.deepEqual(calls, ["psql"]);
  writeFileSync(path, "PGDMP tampered");
  await assert.rejects(restoreDatabase(restoreOptions(path), { root, env: targetEnv, run() { assert.fail("must not access the database"); } }), /checksum/);
});

test("verified empty-target restore is transactional and never requests clean/drop", async (t) => {
  const { root, path } = fixture(t);
  await backupDatabase({ "--output": path }, { root, env: sourceEnv, run: dumpRun });
  const calls = [];
  await restoreDatabase(restoreOptions(path), { root, env: targetEnv, run(connection, tool, args, io) {
    calls.push(tool);
    assert.equal(connection.database, "storyboard_restore_test_drill");
    if (tool === "psql") return "0";
    assert(args.includes("--single-transaction")); assert(args.includes("--exit-on-error"));
    assert(!args.includes("--clean")); assert(!args.includes("--create"));
    assert.equal(readFileSync(io.inputFd, "utf8"), "PGDMP synthetic private records");
    return "";
  } });
  assert.deepEqual(calls, ["psql", "pg_restore"]);
});

test("paths reject repository storage, symlink escape into repository, and loose permissions", (t) => {
  const { root, privateDir, path } = fixture(t);
  assert.throws(() => privateArchivePath(join(root, "backup.dump"), { root, create: true }), /outside/);
  symlinkSync(root, join(privateDir, "link"));
  assert.throws(() => privateArchivePath(join(privateDir, "link", "backup.dump"), { root }), /outside/);
  chmodSync(privateDir, 0o755);
  assert.throws(() => privateArchivePath(path, { root }), /700/);
});

test("archive symlinks and readable-to-others files cannot be restored", async (t) => {
  const { root, path } = fixture(t);
  await backupDatabase({ "--output": path }, { root, env: sourceEnv, run: dumpRun });
  chmodSync(path, 0o644);
  await assert.rejects(restoreDatabase(restoreOptions(path), { root, env: targetEnv, run() { assert.fail(); } }), /600/);
  chmodSync(path, 0o600);
  const link = join(join(path, ".."), "link.dump");
  symlinkSync(path, link);
  await assert.rejects(restoreDatabase(restoreOptions(link), { root, env: targetEnv, run() { assert.fail(); } }));
});

test("connection parsing preserves required SSL settings", () => {
  const connection = recoveryConnection({}, "backup", { DATABASE_URL: "postgresql://operator:p%40ss@localhost:5433/storyboard?schema=public&sslmode=verify-full&sslrootcert=%2Fprivate%2Froot.crt" });
  assert.equal(connection.env.PGPASSWORD, "p@ss");
  assert.equal(connection.env.PGSSLMODE, "verify-full");
  assert.equal(connection.env.PGSSLROOTCERT, "/private/root.crt");
  assert.throws(() => recoveryConnection({}, "backup", { DATABASE_URL: "postgresql://u:p@localhost/storyboard?options=bad" }), /Unsupported connection/);
  assert.throws(() => parseArguments(["--input", "path", "--input", "again"], "restore"), /repeated/);
});

test("host tools receive credentials only in their environment and ambient libpq targets are cleared", (t) => {
  const { privateDir } = fixture(t);
  const fake = join(privateDir, "fake-postgres");
  writeFileSync(fake, '#!/bin/sh\n[ "$PGPASSWORD" = "private-password" ] || exit 2\n[ "$PGDATABASE" = "storyboard_restore_test_drill" ] || exit 3\n[ -z "$PGSERVICE" ] || exit 4\n[ -z "$PGOPTIONS" ] || exit 5\n[ -z "$DATABASE_URL" ] || exit 6\n[ -z "$STORYBOARD_RESTORE_DATABASE_URL" ] || exit 7\nfor arg do case "$arg" in *private-password*|*postgresql://*) exit 8;; esac; done\nprintf "checked"\n', { mode: 0o700 });
  const oldService = process.env.PGSERVICE, oldOptions = process.env.PGOPTIONS;
  process.env.PGSERVICE = "unintended-target"; process.env.PGOPTIONS = "unintended-options";
  try {
    const connection = recoveryConnection(restoreOptions("unused"), "restore", targetEnv);
    assert.equal(runPostgresTool(connection, fake, ["--dbname=storyboard_restore_test_drill"]), "checked");
  } finally {
    if (oldService === undefined) delete process.env.PGSERVICE; else process.env.PGSERVICE = oldService;
    if (oldOptions === undefined) delete process.env.PGOPTIONS; else process.env.PGOPTIONS = oldOptions;
  }
});

test("subprocess failures never expose child stderr or credentials", (t) => {
  const { privateDir } = fixture(t);
  const fake = join(privateDir, "fake-postgres");
  writeFileSync(fake, '#!/bin/sh\nprintf "secret-from-provider-$PGPASSWORD" >&2\nexit 1\n', { mode: 0o700 });
  assert.throws(() => runPostgresTool({ env: { PGPASSWORD: "private-password" } }, fake, []), (error) => {
    assert.match(error.message, /output is suppressed/);
    assert.doesNotMatch(error.message, /secret-from-provider|private-password/);
    return true;
  });
});

test("container restore has the same explicit disposable-name fence", () => {
  assert.throws(() => recoveryConnection({ "--container": "storyboard-postgres-1", "--database": "storyboard", "--user": "storyboard", "--confirm-disposable": "storyboard" }, "restore"), /No production restore/);
  const c = recoveryConnection({ "--container": "storyboard-postgres-1", "--database": "storyboard_restore_test_drill", "--user": "storyboard", "--confirm-disposable": "storyboard_restore_test_drill" }, "restore");
  assert.equal(c.database, "storyboard_restore_test_drill");
});
