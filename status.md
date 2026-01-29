Status: In Progress

## Memory

- Spec: docs/spec.md
- Runtime: Bun (not Node)
- DB: Dolt via nix develop (no Docker needed)
- Stack: Kysely + Hono + MCP SDK
- Structure: monorepo, packages/server/ is main package
- Phase order: 1) Core → 2) REST API → 3) MCP → 4) History
- Phase 1: COMPLETE — schema, client, errors, dolt auto-commit, CRUD queries, migrate, tests
- Phase 2: COMPLETE — Hono app, all REST routes, attribute filtering, include param, optimistic locking (If-Match/ETag), integration tests
- Phase 3: COMPLETE — MCP server (McpServer + StdioServerTransport), all 18 tools registered, zod v4 input schemas
- mysql2: MUST use callback-based `mysql2` import, NOT `mysql2/promise` — Kysely MysqlDialect hangs with promise pool on Bun
- Dolt 1.59: uses `CALL DOLT_COMMIT(...)` stored procedure, NOT `SELECT DOLT_COMMIT(...)` function
- Dolt 1.59: `dolt sql-server` flags are `-H` (host) and `-P` (port), not `--host`/`--port`
- Dolt 1.59: `dolt sql-server` does NOT support `-u`/`--user` flag
- Dolt 1.59: `SELECT DOLT_HASHOF('HEAD') AS hash` for getting current HEAD hash
- Tests: run via `nix develop -c bash scripts/test.sh` — script starts ephemeral Dolt server
- Tests: Dolt database created as subdir named "vds" under --data-dir; DOLT_COMMIT needs proper Dolt-init'd database
- Quality gate: `npx tsc --noEmit && npx biome lint . && nix develop -c bash scripts/test.sh`
- Hono app.request() works for integration tests without HTTP server
- Hono error handler: onError catches AppError subclasses, returns JSON with status code
- Attribute filtering: post-filter approach via ?attr.<type_name>=<value> on GET /items
- MCP SDK: `@modelcontextprotocol/sdk` v1.25.3 — uses McpServer class, registerTool with zod schemas
- Zod v4: `z.record(keySchema, valueSchema)` requires 2 args (not 1 like v3)
