# PR 49 before/after shots

Real `deterministicManagerChat` answers from `origin/main` (`7895cb8`) versus this
branch after merging main. Same function the Manager **Talk it through** UI uses.
Full app boot was blocked in this environment (no Docker/Postgres).

| File | Question | What changed |
| --- | --- | --- |
| `main-pipeline.png` / `branch-pipeline.png` | Show me the pipeline by stage | Main misroutes “Show …” to the live calendar. Branch reports recorded stage counts. |
| `main-pitch-pack.png` / `branch-pitch-pack.png` | Draft a venue pitch pack from records only | Main gives a generic empty board. Branch fail-closes with no auto-pitch. |
| `main-bob-packages.png` / `branch-bob-packages.png` | Can Bob send a booking pack to Milwaukee venues? | Main offers generic next-move copy. Branch: Travis books, Bob packages, no auto-pitch. |
