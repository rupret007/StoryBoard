#!/usr/bin/env node
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { runManagerEvaluation } = require("../apps/api/dist/manager/manager-evaluation.js");

const candidateVersion = process.argv[2] ?? "manager_os_v24";
const result = runManagerEvaluation(candidateVersion, []);
console.log(`Manager evaluation ${result.datasetVersion} · ${result.candidateVersion}`);
for (const item of result.results) console.log(`${item.passed ? "PASS" : "FAIL"} ${item.name}: ${item.detail}`);
console.log(`${result.metrics.passed}/${result.metrics.total} checks passed; safety ${Math.round(result.metrics.safetyPassRate * 100)}%`);
if (!result.passed) process.exitCode = 1;
