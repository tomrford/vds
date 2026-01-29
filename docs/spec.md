# vds - Versioned Data Store

A local-first, version-controlled data store for managing interconnected items with typed attributes and linkages. Built on Dolt (MySQL-compatible, Git-like versioning) with REST and MCP interfaces.

## Overview

A generic data kernel that stores items (text blobs) with typed attributes and typed linkages between them. All mutations are automatically version-controlled via Dolt - every write is a commit, giving you full history for free.

The server exposes two interfaces:
- **REST API** - for any HTTP client (CLI, desktop UI, scripts)
- **MCP server** - for AI agents (Claude, Cursor, etc.)

Versioning is internal - history is readable but not directly manipulable by users. No branching/merging exposed in v1.

## Tech Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Database | Dolt | Git-like versioning, MySQL-compatible, 1.1x MySQL perf |
| Runtime | Bun | Fast, native TS, good DX |
| Query builder | Kysely | Type-safe, flexible for raw SQL (version control queries) |
| API | Hono | Lightweight, Bun-native |
| MCP | @modelcontextprotocol/sdk | Standard agent interface |

## Data Model

### Tables

```sql
items (
  id          VARCHAR(36) PRIMARY KEY,
  body        TEXT NOT NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)

attribute_types (
  id          VARCHAR(36) PRIMARY KEY,
  name        VARCHAR(255) NOT NULL UNIQUE,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)

linkage_types (
  id          VARCHAR(36) PRIMARY KEY,
  name        VARCHAR(255) NOT NULL UNIQUE,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)

attributes (
  id          VARCHAR(36) PRIMARY KEY,
  item_id     VARCHAR(36) NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  type_id     VARCHAR(36) NOT NULL REFERENCES attribute_types(id) ON DELETE RESTRICT,
  value       TEXT NOT NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(item_id, type_id)
)

linkages (
  id          VARCHAR(36) PRIMARY KEY,
  source_id   VARCHAR(36) NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  target_id   VARCHAR(36) NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  type_id     VARCHAR(36) NOT NULL REFERENCES linkage_types(id) ON DELETE RESTRICT,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(source_id, target_id, type_id)
)
```

### Design Decisions

- **UUIDs**: Offline-safe, no conflicts across branches
- **Separate type tables**: Enforces consistency, enumerable values, indexed lookups
- **Text for values**: JSON when needed, parse on read
- **CASCADE on item delete**: Removing item cleans up its attributes and linkages
- **RESTRICT on type delete**: Can't delete a type that's in use - forces explicit cleanup
- **UNIQUE(item_id, type_id)**: One attribute of each type per item (single cardinality)
- **UNIQUE(source, target, type)**: One linkage of each type per item pair

## REST API

All responses are JSON. Errors return `{ error: string, details?: any }`.

### Items

```
POST   /items                     Create item { body }
GET    /items                     List items (?attr.status=done, ?limit, ?offset)
GET    /items/:id                 Get item (?include=attributes,linkages)
PATCH  /items/:id                 Update item { body }
DELETE /items/:id                 Delete item (cascades)
```

### Attributes

```
GET    /items/:id/attributes      List attributes for item
POST   /items/:id/attributes      Add attribute { type_id, value }
PATCH  /attributes/:id            Update attribute { value }
DELETE /attributes/:id            Remove attribute
```

### Attribute Types

```
GET    /attribute-types           List all types
POST   /attribute-types           Create type { name }
DELETE /attribute-types/:id       Delete type (fails if in use)
```

### Linkages

```
GET    /items/:id/linkages        Get linkages (?direction=source|target|both)
POST   /linkages                  Create linkage { source_id, target_id, type_id }
DELETE /linkages/:id              Remove linkage
```

### Linkage Types

```
GET    /linkage-types             List all types
POST   /linkage-types             Create type { name }
DELETE /linkage-types/:id         Delete type (fails if in use)
```

### History (read-only)

```
GET    /history                   List commits (?limit, ?offset)
GET    /history/:commit           Get commit details
GET    /items/:id/history         Get item's change history
```

### Optimistic Locking (optional)

Pass `If-Match: <commit-hash>` header on mutations. Server rejects if HEAD has moved, returning `409 Conflict` with current HEAD. Client can then re-fetch and retry.

## MCP Tools

Direct mapping to REST endpoints.

### Items
- `create_item(body)` → POST /items
- `list_items(filters?)` → GET /items
- `get_item(id, include?)` → GET /items/:id
- `update_item(id, body)` → PATCH /items/:id
- `delete_item(id)` → DELETE /items/:id

### Attributes
- `list_attributes(item_id)` → GET /items/:id/attributes
- `add_attribute(item_id, type_id, value)` → POST /items/:id/attributes
- `update_attribute(id, value)` → PATCH /attributes/:id
- `remove_attribute(id)` → DELETE /attributes/:id

### Attribute Types
- `list_attribute_types()` → GET /attribute-types
- `create_attribute_type(name)` → POST /attribute-types
- `delete_attribute_type(id)` → DELETE /attribute-types/:id

### Linkages
- `list_linkages(item_id, direction?)` → GET /items/:id/linkages
- `create_linkage(source_id, target_id, type_id)` → POST /linkages
- `remove_linkage(id)` → DELETE /linkages/:id

### Linkage Types
- `list_linkage_types()` → GET /linkage-types
- `create_linkage_type(name)` → POST /linkage-types
- `delete_linkage_type(id)` → DELETE /linkage-types/:id

### History
- `list_commits(limit?)` → GET /history
- `get_commit(hash)` → GET /history/:commit
- `get_item_history(item_id)` → GET /items/:id/history

## Versioning Behavior

Every mutation auto-commits to Dolt with a generated message:

```
create_item: "Create item <id>"
update_item: "Update item <id>"
delete_item: "Delete item <id>"
add_attribute: "Add <type_name> to item <id>"
create_linkage: "Link <source_id> -> <target_id> (<type_name>)"
...etc
```

History is append-only and read-only from the API. No branching, merging, or checkout exposed. Dolt's versioning provides:
- Full audit trail
- Point-in-time queries (via Dolt's `AS OF` internally)
- Implicit soft-deletes (recover from history)

## Project Structure

```
vds/
├── packages/
│   ├── server/               # REST + MCP server
│   │   ├── src/
│   │   │   ├── index.ts      # Entry point
│   │   │   ├── db/
│   │   │   │   ├── schema.ts # Kysely types
│   │   │   │   ├── client.ts # DB connection
│   │   │   │   └── queries/  # Query functions
│   │   │   ├── api/
│   │   │   │   ├── app.ts    # Hono app
│   │   │   │   └── routes/   # Route handlers
│   │   │   ├── mcp/
│   │   │   │   ├── server.ts # MCP server
│   │   │   │   └── tools/    # Tool definitions
│   │   │   └── lib/
│   │   │       ├── dolt.ts   # Dolt-specific queries (commit, history)
│   │   │       └── errors.ts # Error types
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── cli/                  # (placeholder - separate consumer)
│   └── ui/                   # (placeholder - separate consumer)
│
├── docker-compose.yml        # Dolt for local dev
├── package.json              # Bun workspace root
├── bunfig.toml
└── README.md
```

## Development Phases

### Phase 1: Core
- [ ] Dolt running in Docker
- [ ] Kysely schema and connection
- [ ] CRUD queries for all tables
- [ ] Auto-commit wrapper

### Phase 2: REST API
- [ ] Hono app with all routes
- [ ] Query parameter filtering
- [ ] Include parameter (attributes, linkages)
- [ ] Error handling
- [ ] Optimistic locking (If-Match)

### Phase 3: MCP
- [ ] MCP server setup
- [ ] All tools implemented
- [ ] Test with Claude

### Phase 4: History
- [ ] Commit list endpoint
- [ ] Item history endpoint
- [ ] Point-in-time queries (internal use)

## Configuration

Environment variables:

```
DOLT_HOST=localhost
DOLT_PORT=3306
DOLT_USER=root
DOLT_PASSWORD=
DOLT_DATABASE=vds

VDS_PORT=3000
```

## Future Considerations (not in v1)

- **Branching**: Expose branch/merge for "draft" workflows
- **Auth**: Token-based auth for multi-user
- **Sync**: Push/pull to remote Dolt (S3, DoltHub)
- **Search**: Full-text search on item body
- **Tags**: Multi-cardinality attributes (separate table)
- **Webhooks**: Notify on mutations
- **Batch operations**: Bulk create/update/delete

## References

- [Dolt documentation](https://docs.dolthub.com/)
- [Kysely documentation](https://kysely.dev/)
- [Hono documentation](https://hono.dev/)
- [MCP specification](https://modelcontextprotocol.io/)
