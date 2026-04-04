---
description: StoryBoard project principles and guardrails
alwaysApply: true
---

# StoryBoard Rules

## Persistent Project Principles

- Build one coherent app for band and artist operations
- Keep PostgreSQL as the single source of truth
- Resolve natural language into structured actions, never opaque magic
- Prefer dry-run previews before writes when practical
- Require approval before risky external or operational actions
- Make important actions auditable

## Approved Stack

- pnpm workspace monorepo
- Next.js, React, TypeScript, Tailwind for `apps/web`
- NestJS, Prisma, PostgreSQL, Redis, BullMQ, Zod for `apps/api`
- OpenAI Responses API with JSON-schema tool calling for orchestration

## Architecture Guardrails

- All third-party systems must sit behind adapters
- Domain logic must not call provider SDKs directly
- Shared schemas and contracts belong in `packages/shared`
- Reusable UI primitives belong in `packages/ui`
- Queue-backed async work should use BullMQ

## Testing Expectations

- Add focused tests for real workflow behavior
- Prefer integration coverage for multi-step operational flows
- Avoid low-value placeholder or snapshot-only tests

## Approval and Audit Expectations

- External sends and risky state changes require approvals
- Command runs should create auditable records
- Dry-run outputs should be explicit and inspectable
