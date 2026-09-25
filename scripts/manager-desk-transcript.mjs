#!/usr/bin/env node
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { managerDeskTranscripts, evaluateManagerDesk } = require("../apps/api/dist/manager/manager-desk-evaluation.js");
console.log("# Offline Manager chat transcript\n\nSynthetic fixtures only; no live band data, provider calls, or database writes.\n");
for (const row of managerDeskTranscripts()) {
  console.log(`## ${row.name}\n\nQuestion: ${row.question}\n\n${row.answer}\n\nCitations: ${row.citations.join(", ") || "none"}\n`);
}
const checks = evaluateManagerDesk();
console.log(`${checks.filter((row) => row.passed).length}/${checks.length} desk checks passed.`);
if (checks.some((row) => !row.passed)) process.exitCode = 1;
