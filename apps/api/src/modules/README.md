# API Modules

This directory reserves the main StoryBoard domain boundaries:

- `venues`
- `contacts`
- `promoters`
- `booking-pipeline`
- `tasks`
- `approvals`
- `audit`
- `command-center`
- `weekly-summary`

Each module should own its application services, transport DTOs, and use cases
while persisting to the shared PostgreSQL schema through Prisma.
