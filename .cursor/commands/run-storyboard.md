# Run StoryBoard

Use this command when working on StoryBoard implementation tasks.

## Required workflow

1. Confirm the task stays within the locked StoryBoard stack
2. Respect the architecture docs and project rule file
3. Keep PostgreSQL as the source of truth
4. Route external systems through adapters only
5. Prefer dry-run behavior for writes when practical
6. Require explicit approval handling for risky actions
7. Preserve auditability for important workflow changes

## Delivery expectations

- Work in the monorepo structure already defined in this repository
- Prefer small, coherent slices that move the MVP forward
- Keep natural-language features mapped to structured actions
- Update docs when architecture or workflow expectations change
- Add focused tests when behavior becomes meaningful enough to justify them

## Stop points

Pause and ask before:

- introducing a new stack component
- changing the source-of-truth model
- bypassing approval or audit requirements
- implementing risky outbound execution without a dry-run path
