#!/usr/bin/env node
import { parseArguments, restoreDatabase } from "./database-recovery.mjs";

// No dotenv loading: the disposable restore target must be supplied explicitly.
try {
  const result = await restoreDatabase(parseArguments(process.argv.slice(2), "restore"));
  console.log(`Restored into disposable database ${result.database}.\nArchive SHA-256: ${result.sha256}\nVerify representative records and application reads before claiming recovery. Production was not restored.`);
} catch (error) {
  console.error(`Restore refused or failed: ${error.message}`);
  process.exitCode = 1;
}
