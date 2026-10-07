import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { constants, closeSync, existsSync, fstatSync, mkdirSync, openSync, readFileSync, readSync, realpathSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const disposableName = /^storyboard_restore_test_[a-z0-9_]+$/;
const allowedSslModes = new Set(["disable", "allow", "prefer", "require", "verify-ca", "verify-full"]);
const emptyDatabaseSql = `SELECT
  (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema') +
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema') +
  (SELECT count(*) FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema') +
  (SELECT count(*) FROM pg_namespace WHERE nspname !~ '^pg_' AND nspname NOT IN ('public','information_schema'));`;

export function parseArguments(argv, mode) {
  const allowed = new Set(mode === "backup"
    ? ["--output", "--container", "--database", "--user"]
    : ["--input", "--container", "--database", "--user", "--confirm-disposable"]);
  const options = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!allowed.has(argv[i]) || options[argv[i]] !== undefined || !argv[i + 1] || argv[i + 1].startsWith("--")) {
      throw new Error("Invalid or repeated option. See docs/backup-restore.md; never pass connection URLs on the command line.");
    }
    options[argv[i]] = argv[i + 1];
  }
  if (!options[mode === "backup" ? "--output" : "--input"]) {
    throw new Error(mode === "backup" ? "--output is required." : "--input is required.");
  }
  return options;
}

export function recoveryConnection(options, mode, env = process.env) {
  let connection;
  if (options["--container"]) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(options["--container"]) ||
        !/^[a-zA-Z0-9_]+$/.test(options["--database"] ?? "") ||
        !/^[a-zA-Z0-9_]+$/.test(options["--user"] ?? "")) {
      throw new Error("Container mode requires --container, --database and --user with simple names.");
    }
    connection = { container: options["--container"], database: options["--database"], user: options["--user"], env: {} };
  } else {
    if (options["--database"] || options["--user"]) throw new Error("--database and --user require --container.");
    const key = mode === "backup" ? "DATABASE_URL" : "STORYBOARD_RESTORE_DATABASE_URL";
    let url;
    try { url = new URL(env[key] ?? ""); } catch { throw new Error(`${key} must contain an explicit PostgreSQL URL.`); }
    if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname || url.hash) throw new Error(`${key} must contain a PostgreSQL host and database.`);
    let database, user, password;
    try {
      database = decodeURIComponent(url.pathname.slice(1));
      user = decodeURIComponent(url.username);
      password = decodeURIComponent(url.password);
    } catch { throw new Error(`${key} contains invalid URL encoding.`); }
    if (!/^[a-zA-Z0-9_][a-zA-Z0-9_.-]*$/.test(database) || !user || /[\r\n\0]/.test(user + password)) throw new Error(`${key} must name a database and user without control characters.`);
    const pgEnv = {
      PGHOST: url.hostname.replace(/^\[|\]$/g, ""), PGPORT: url.port || "5432",
      PGDATABASE: database, PGUSER: user, PGPASSWORD: password, PGCONNECT_TIMEOUT: "10"
    };
    const keys = { sslmode: "PGSSLMODE", sslrootcert: "PGSSLROOTCERT", sslcert: "PGSSLCERT", sslkey: "PGSSLKEY", connect_timeout: "PGCONNECT_TIMEOUT" };
    for (const [key, value] of url.searchParams) {
      if (key === "schema" && value === "public") continue;
      if (!keys[key] || /[\r\n\0]/.test(value)) throw new Error(`${key === "schema" ? "Non-public schemas are" : "Unsupported connection parameters are"} not supported by this recovery procedure.`);
      if (key === "sslmode" && !allowedSslModes.has(value)) throw new Error("Unsupported PostgreSQL SSL mode.");
      if (key === "connect_timeout" && !/^[1-9][0-9]{0,2}$/.test(value)) throw new Error("connect_timeout must be between 1 and 999 seconds.");
      pgEnv[keys[key]] = value;
    }
    connection = { database, user, env: pgEnv };
  }
  if (mode === "restore" && (!disposableName.test(connection.database) || options["--confirm-disposable"] !== connection.database)) {
    throw new Error("Restore requires an empty database named storyboard_restore_test_<label> and --confirm-disposable with that exact name. No production restore is supported.");
  }
  return connection;
}

export function privateArchivePath(input, { create = false, root = repositoryRoot } = {}) {
  if (!isAbsolute(input)) throw new Error("Archive path must be absolute and outside the repository.");
  const path = resolve(input);
  if (create) mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const directory = realpathSync(dirname(path));
  const rel = relative(realpathSync(root), directory);
  if (!rel || (!rel.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) && !isAbsolute(rel) && rel !== "..")) {
    throw new Error("Backups must be outside the repository.");
  }
  const info = statSync(directory);
  if ((info.mode & 0o077) !== 0 || (process.getuid && info.uid !== process.getuid())) throw new Error("Backup directory must belong to this user and have permissions 700.");
  const git = spawnSync("git", ["-C", directory, "rev-parse", "--show-toplevel"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  if (git.status === 0) throw new Error("Backups must be outside every Git working tree.");
  return resolve(directory, basename(path));
}

export function runPostgresTool(connection, tool, args, { inputFd, outputFd } = {}) {
  const env = { ...process.env };
  // Avoid ambient libpq settings redirecting a checked target or injecting options.
  for (const key of Object.keys(env)) if (key.startsWith("PG") || key === "DATABASE_URL" || key === "STORYBOARD_RESTORE_DATABASE_URL") delete env[key];
  Object.assign(env, connection.env);
  let command = tool, commandArgs = args;
  if (connection.container) {
    command = "docker";
    // The official Postgres image owns these variables; credentials never enter argv.
    commandArgs = ["exec", "-i", connection.container, "sh", "-c", 'unset PGHOST PGHOSTADDR PGPORT PGDATABASE PGUSER PGOPTIONS PGSERVICE PGSERVICEFILE; export PGPASSWORD="$POSTGRES_PASSWORD"; exec "$@"', "sh", tool,
      ...(tool === "pg_restore" && args.includes("--list") ? [] : [`--username=${connection.user}`]), ...args];
  }
  const result = spawnSync(command, commandArgs, { env, encoding: "utf8", maxBuffer: 8 * 1024 * 1024, stdio: [inputFd ?? "ignore", outputFd ?? "pipe", "pipe"] });
  if (result.error || result.status !== 0) {
    // libpq / Docker errors can include credentials, remote details or SQL data.
    throw new Error(`${tool} failed. Check client/server versions, connectivity, credentials, permissions and database state locally. Child output is suppressed to protect private data.`);
  }
  return result.stdout?.trim() ?? "";
}

function digest(fd) {
  const hash = createHash("sha256");
  const buffer = Buffer.alloc(1024 * 1024);
  let position = 0, bytes;
  while ((bytes = readSync(fd, buffer, 0, buffer.length, position)) > 0) {
    hash.update(buffer.subarray(0, bytes));
    position += bytes;
  }
  return hash.digest("hex");
}

function privateFile(path) {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  const info = fstatSync(fd);
  if (!info.isFile() || (info.mode & 0o077) !== 0 || (process.getuid && info.uid !== process.getuid())) {
    closeSync(fd);
    throw new Error("Archive and manifest must be ordinary files owned by this user with permissions 600.");
  }
  return fd;
}

export async function backupDatabase(options, { env = process.env, run = runPostgresTool, root } = {}) {
  const connection = recoveryConnection(options, "backup", env);
  const path = privateArchivePath(options["--output"], { create: true, root });
  if (existsSync(path) || existsSync(`${path}.json`)) throw new Error("Backup destination already exists; choose a new filename.");
  let fd, ownsArchive = false;
  try {
    fd = openSync(path, "wx", 0o600);
    ownsArchive = true;
    run(connection, "pg_dump", ["--no-password", "--format=custom", "--no-owner", "--no-privileges", `--dbname=${connection.database}`], { outputFd: fd });
    closeSync(fd); fd = undefined;
    const inputFd = privateFile(path);
    let manifest;
    try {
      run(connection, "pg_restore", ["--list"], { inputFd });
      manifest = { format: "storyboard_pg_backup_v1", createdAt: new Date().toISOString(), bytes: fstatSync(inputFd).size, sha256: digest(inputFd) };
    } finally { closeSync(inputFd); }
    writeFileSync(`${path}.json`, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    return { archive: path, manifest: `${path}.json` };
  } catch (error) {
    if (fd !== undefined) closeSync(fd);
    if (ownsArchive && existsSync(path)) unlinkSync(path);
    throw error;
  }
}

export async function restoreDatabase(options, { env = process.env, run = runPostgresTool, root } = {}) {
  // Target validation happens before any database connection; DATABASE_URL is never a fallback.
  const connection = recoveryConnection(options, "restore", env);
  const path = privateArchivePath(options["--input"], { root });
  const inputFd = privateFile(path);
  try {
    const manifestFd = privateFile(`${path}.json`);
    let manifest;
    try { manifest = JSON.parse(readFileSync(manifestFd, "utf8")); } catch { throw new Error("Backup manifest is invalid."); } finally { closeSync(manifestFd); }
    if (manifest.format !== "storyboard_pg_backup_v1" || manifest.bytes !== fstatSync(inputFd).size || manifest.sha256 !== digest(inputFd)) throw new Error("Backup checksum or size does not match its manifest; restore refused.");
    const count = run(connection, "psql", ["-X", "--no-password", "--tuples-only", "--no-align", "--set=ON_ERROR_STOP=1", `--dbname=${connection.database}`, "--command", emptyDatabaseSql]);
    if (count !== "0") throw new Error("Restore target is not empty; no restore was attempted. Create a new disposable database.");
    run(connection, "pg_restore", ["--no-password", "--single-transaction", "--exit-on-error", "--no-owner", "--no-privileges", `--dbname=${connection.database}`], { inputFd });
    return { database: connection.database, sha256: manifest.sha256 };
  } finally { closeSync(inputFd); }
}
