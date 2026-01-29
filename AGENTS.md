# vds - Versioned Data Store

Local-first, version-controlled data store. Items with typed attributes and typed linkages between them. All mutations auto-committed via Dolt. Full spec in `docs/spec.md`.

## Stack

- **Runtime**: Bun (not Node). `bun install`, `bun test`, `bun run`.
- **Database**: Dolt (MySQL-compatible, Git-like versioning)
- **Query builder**: Kysely (type-safe SQL)
- **API**: Hono (lightweight HTTP framework)
- **MCP**: @modelcontextprotocol/sdk

## Environment

Dolt is available via the nix dev shell (`nix develop`). No Docker needed for the `dolt` CLI itself. Tests can spin up a local Dolt SQL server directly:

```sh
dolt sql-server -u root -l trace --port 3307  # ephemeral test server
```

Use a temp directory + `dolt init` + `dolt sql-server` for isolated test databases. Tear down after.

## Conventions

- Bun for everything: `bun <file>`, `bun test`, `bun install`, `bunx`.
- Bun auto-loads `.env` — no dotenv.
- `bun:test` for tests (`import { test, expect } from "bun:test"`).
- Hono for HTTP — not express, not `Bun.serve()` routes directly.
- Kysely for queries — no raw SQL strings unless Dolt-specific (versioning, `AS OF`).
- UUIDs for all primary keys.
- Conventional commits (feat|fix|refactor|...).
- Keep files under ~500 LOC.

## Project Structure

Monorepo: `packages/server/` is the main package. See `docs/spec.md` for full layout.

## Quality Gate

Before marking work done: `bun run typecheck && bun run lint && bun test`
