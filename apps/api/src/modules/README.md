# API Modules

StoryBoard's Nest modules live as sibling directories under `apps/api/src`.
Current boundaries include:

- `auth`, `artists`, and `memberships`
- `venues`
- `contacts`
- `booking` and `advisor`
- `tasks`
- `manager`
- `operations`
- `approvals` and `audit`
- `commands`, `dashboard`, and `summary`
- `integrations`, `workflow-automation`, and `queue`

Each boundary owns its application services, HTTP controllers, validation, and
use cases while persisting through the shared Prisma service. Artist-owned
writes must enforce membership/role rules, validate related record ownership,
and create audit events. Provider calls stay behind `integrations`; risky calls
execute only through approved `ApprovalRequest` records.

Use [`../../../../docs/package-map.md`](../../../../docs/package-map.md) for the
maintained file map. This directory remains documentation-only and is not a
Nest module itself.
