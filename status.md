Status: In Progress

## Memory

- Spec: docs/spec.md
- Runtime: Bun (not Node)
- DB: Dolt via nix develop (no Docker needed)
- Stack: Kysely + Hono + MCP SDK
- Structure: monorepo, packages/server/ is main package
- Phase order: 1) Core → 2) REST API → 3) MCP → 4) History
- Phase 1: COMPLETE — schema, client, errors, dolt auto-commit, CRUD queries, migrate, tests
- mysql2: MUST use callback-based `mysql2` import, NOT `mysql2/promise` — Kysely MysqlDialect hangs with promise pool on Bun
- Dolt 1.59: uses `CALL DOLT_COMMIT(...)` stored procedure, NOT `SELECT DOLT_COMMIT(...)` function
- Dolt 1.59: `dolt sql-server` flags are `-H` (host) and `-P` (port), not `--host`/`--port`
- Dolt 1.59: `dolt sql-server` does NOT support `-u`/`--user` flag
- Tests: run via `nix develop -c bash scripts/test.sh` — script starts ephemeral Dolt server
- Tests: Dolt database created as subdir named "vds" under --data-dir; DOLT_COMMIT needs proper Dolt-init'd database
- Quality gate: `bun run typecheck && bun run lint && nix develop -c bash scripts/test.sh`
