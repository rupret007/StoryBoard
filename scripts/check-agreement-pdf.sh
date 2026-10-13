#!/usr/bin/env bash
# Run from the worktree root with dependencies already installed. No installs,
# servers, migrations, provider calls, or deployment commands are performed.
# The standard Next build still requires its Google Font to be locally available;
# an unavailable font is a build failure, never a skipped or substituted check.
set -euo pipefail
test -f apps/api/test/agreement-pdf-capacity.test.mjs
test -d node_modules
export CI=true NEXT_TELEMETRY_DISABLED=1 PNPM_CONFIG_OFFLINE=true
export OPENAI_ENABLED=false GMAIL_REPLY_SYNC_ENABLED=false TELEGRAM_ENABLED=false
export DATABASE_URL=postgresql://test:test@127.0.0.1:5432/storyboard_s10_gate

# Keep the complete run below 30 minutes and terminate only children started here.
# Continue after a failed step so all standard gate results remain visible.
python3 - <<'PY'
import os
import signal
import subprocess
import sys
import time

deadline = time.monotonic() + 25 * 60
steps = [
    ("Prisma client generation (no database connection)", ["pnpm", "db:generate"]),
    ("Shared build", ["pnpm", "--filter", "@storyboard/shared", "build"]),
    ("API build for focused tests", ["pnpm", "--filter", "@storyboard/api", "build"]),
    ("Focused PDF regression tests", ["node", "--test", "apps/api/test/agreement-pdf-capacity.test.mjs"]),
    ("Standard typecheck", ["pnpm", "typecheck"]),
    ("Standard lint", ["pnpm", "lint"]),
    ("Standard tests", ["pnpm", "test"]),
    ("Standard production builds (includes apps/web)", ["pnpm", "build"]),
    ("Standard offline Manager eval", ["pnpm", "manager:eval"]),
]
failed = False
for label, command in steps:
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        print(f"NOT RUN: {label} (25-minute deadline reached)", flush=True)
        failed = True
        continue
    print(f"\nRUN: {label}: {' '.join(command)}", flush=True)
    process = subprocess.Popen(command, start_new_session=True)
    try:
        result = process.wait(timeout=remaining)
    except subprocess.TimeoutExpired:
        os.killpg(process.pid, signal.SIGTERM)
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGKILL)
            process.wait()
        result = 124
    print(f"RESULT: {label}: exit {result}", flush=True)
    failed |= result != 0
sys.exit(1 if failed else 0)
PY
