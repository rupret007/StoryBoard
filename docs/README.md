# StoryBoard documentation

Use this page to choose the smallest document that answers your question. The
root [`README.md`](../README.md) is the product overview and quickest way to
start StoryBoard; this directory holds the operational and implementation
detail.

## Start by task

| I want to… | Read |
| --- | --- |
| Run StoryBoard locally | [`developer-runbook.md`](developer-runbook.md) |
| Understand the current shipped state | [`codex-handoff.md`](codex-handoff.md) |
| Understand system boundaries | [`architecture.md`](architecture.md) |
| Understand records and relationships | [`domain-model.md`](domain-model.md) |
| Find a package or code entry point | [`package-map.md`](package-map.md) |
| Configure local infrastructure and environment variables | [`environment-setup-plan.md`](environment-setup-plan.md) |
| Configure Google OAuth and connected Google tools | [`integrations-google-oauth.md`](integrations-google-oauth.md) |
| Understand provider and adapter limits | [`integration-plan.md`](integration-plan.md) |
| Understand operator sign-in, sessions, and roles | [`auth-operators.md`](auth-operators.md) |
| Invite operators or onboard an artist | [`invitations.md`](invitations.md) |
| Operate notifications and background jobs | [`workflow-automation.md`](workflow-automation.md) |
| Configure Telegram alerts and registration | [`telegram-alerts.md`](telegram-alerts.md) |

## Sources of truth

- [`../README.md`](../README.md) describes the current product and supported
  workspace commands.
- [`developer-runbook.md`](developer-runbook.md) is authoritative for setup,
  validation, and release procedures.
- [`codex-handoff.md`](codex-handoff.md) is the concise current-delivery
  snapshot for coding agents.
- [`../MODERNIZATION_PLAN.md`](../MODERNIZATION_PLAN.md) is the chronological
  engineering record and remaining-priority list. It is intentionally detailed.
- [`.cursor/plans/storyboard-master-plan.md`](../.cursor/plans/storyboard-master-plan.md)
  is historical context, not the current implementation contract.

When documentation and code disagree, verify the current implementation and
correct the documentation in the same change. Do not infer permissions or
provider capabilities from an old roadmap.
