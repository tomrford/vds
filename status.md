Status: In Progress

## Memory

- Spec: docs/spec.md
- Runtime: Bun (not Node)
- DB: Dolt (MySQL-compat, needs Docker)
- Stack: Kysely + Hono + MCP SDK
- Structure: monorepo packages/server/
- Phase order: 1) Core (Docker/DB/queries/auto-commit) → 2) REST API → 3) MCP → 4) History
