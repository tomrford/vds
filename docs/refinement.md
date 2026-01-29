# API Refinement

Changes to REST, MCP, and history handling. Spec diff against `docs/spec.md`.

## 1. Point-in-Time Queries (replace history endpoints)

Drop all `/history` endpoints and MCP history tools. Instead, add `?as_of=<commit_hash|datetime>` to every GET endpoint. Omitting gives latest state.

```
GET /items?as_of=abc123def
GET /items/:id?as_of=2025-06-15T10:30:00Z
GET /attribute-types?as_of=abc123def
GET /linkage-types?as_of=abc123def
```

### Dolt mechanism

Dolt's `AS OF` clause is per-table in the FROM clause. Supports commit hashes and `TIMESTAMP()` for datetimes natively — no manual resolution needed.

```sql
SELECT * FROM items AS OF 'abc123def' WHERE id = '...';
SELECT * FROM items AS OF TIMESTAMP('2025-06-15T10:30:00Z') WHERE id = '...';
```

### Kysely integration

Kysely has no native `AS OF` support (it's Dolt-specific SQL). A plugin-based approach doesn't work — `OperationNodeTransformer.transformTable` must return a `TableNode`, and `AS OF` has no AST representation in Kysely.

Instead: use Kysely's `sql` template tag to produce table expressions. A helper keeps it to a one-line change per query function.

```typescript
// lib/dolt.ts
import { sql } from "kysely";

/** Build a table expression with optional AS OF clause for Dolt point-in-time queries. */
export function asOfTable(table: string, asOf?: string) {
  if (!asOf) return table;
  if (asOf.includes("T") || /^\d{4}-/.test(asOf)) {
    return sql`${sql.table(table)} AS OF TIMESTAMP(${asOf})`.as(table);
  }
  return sql`${sql.table(table)} AS OF ${asOf}`.as(table);
}
```

Query functions add an optional `asOf` param and swap their `selectFrom` target:

```typescript
// Before
export async function getItem(db: Kysely<Database>, id: string) {
  return db.selectFrom("items").selectAll().where("id", "=", id)...
}

// After
export async function getItem(db: Kysely<Database>, id: string, asOf?: string) {
  return db.selectFrom(asOfTable("items", asOf)).selectAll().where("id", "=", id)...
}
```

Queries with joins need `asOfTable` on each joined table (e.g. `listItems` joins `attributes` and `attribute_types` for filtering).

Route/tool handlers extract `as_of` and pass it through:

```typescript
// routes
const asOf = c.req.query("as_of");
const result = await items.getItem(db, id, asOf);
```

```typescript
// MCP tools
const result = await items.getItem(db, id, as_of);
```

### Rejected approaches

- **`USE vds/<hash>`**: session-scoped — unsafe in connection pools with concurrent readers.
- **Kysely plugin (`OperationNodeTransformer`)**: `transformTable` must return `TableNode`; can't inject raw `AS OF` SQL at AST level.
- **Always add `AS OF NOW()`**: works but adds unnecessary overhead — Dolt resolves timestamp→commit on every query. Plain queries without `AS OF` read HEAD directly.

### Removed

- `GET /history` — commit log listing
- `GET /history/:commit` — single commit details
- `GET /items/:id/history` — item change history
- MCP: `list_commits`, `get_commit`, `get_item_history`
- `doltLog()`, `doltCommitDetails()`, `doltItemHistory()` from `lib/dolt.ts`
- `DoltDiffItem` interface (unused)

### Kept

- `doltHead()` — still needed for optimistic locking
- `doltCommit()`, `withAutoCommit()` — still needed for mutations
- `DoltCommitInfo` — still used internally by auto-commit

## 2. Richer GET Responses

Drop `?include` parameter. Inline data by default based on the endpoint's purpose.

### `GET /items` — catalog view (items + attributes)

Always returns attributes inline. The attribute filter (`?attr.status=done`) already joins attributes — not returning them is inconsistent. No linkages on list: a linkage between items A and B would appear in both results, duplicating data.

```typescript
GET /items
// Response:
[{
  id, body, created_at,
  attributes: [{ id, type_id, value, created_at }]
}]
```

### `GET /items/:id` — relationship view (item + attributes + linkages)

Full picture of a single item including its connections.

```typescript
GET /items/:id
// Response:
{
  id, body, created_at,
  attributes: [{ id, type_id, value, created_at }],
  linkages: [{ id, source_id, target_id, type_id, created_at }]
}
```

### `GET /linkages` — flat linkage list for graph/analytics queries

Standalone endpoint for querying linkages without going through items. Avoids duplication problem from list_items. Filterable by type, source, and/or target.

```
GET /linkages?type_id=<id>&source_id=<id>&target_id=<id>
```

All filters optional. Supports `?as_of` like all GETs. Pagination via `?limit`, `?offset`.

## 3. Richer PATCH /items/:id (REST)

Extend PATCH to handle body + attribute mutations in one call, one commit.

```typescript
PATCH /items/:id
{
  body?: string,                           // update body text
  attributes?: {
    set?: [{ type_id: string, value: string }],  // upsert (add or update)
    remove?: string[]                             // attribute type_ids to remove
  }
}
```

`set` upserts: if attribute of that type exists, update value; if not, insert. Uses the existing `UNIQUE(item_id, type_id)` constraint.

`remove` takes type_ids (not attribute row ids) — caller says "remove the status attribute" not "remove attribute row abc-123". Deletes the `attributes` row matching `(item_id, type_id)`.

All changes within a single `withAutoCommit()` call.

### Attribute removal clarification

"Removing an attribute from an item" = deleting the row from `attributes` where `(item_id, type_id)` matches. The attribute type itself is untouched. Currently this requires knowing the attribute row UUID and calling `DELETE /attributes/:id`. The new PATCH makes this more natural: pass the type_id in `remove` and the server resolves the row.

Standalone `DELETE /attributes/:id` and `PATCH /attributes/:id` REST endpoints remain for direct use.

## 4. MCP Tool Consolidation

REST stays as-is (plus the richer PATCH above). MCP tools get consolidated for LLM ergonomics.

### Consolidated `update_item`

```typescript
server.registerTool("update_item", {
  description: "Update an item: body, attributes, or both",
  inputSchema: {
    id: z.string(),
    body: z.string().optional(),
    attributes: z.object({
      set: z.array(z.object({
        type_id: z.string(),
        value: z.string(),
      })).optional(),
      remove: z.array(z.string()).optional().describe("Attribute type_ids to remove"),
    }).optional(),
  },
});
```

### Consolidated `get_item`

```typescript
server.registerTool("get_item", {
  description: "Get an item with its attributes and linkages",
  inputSchema: {
    id: z.string(),
    as_of: z.string().optional().describe("Commit hash or datetime for point-in-time read"),
  },
});
// Always returns { ...item, attributes: [...], linkages: [...] }
```

### Batch linkage operations

`create_linkage` and `remove_linkage` accept arrays so tools can manage multiple linkages in one call, one commit.

```typescript
server.registerTool("create_linkages", {
  description: "Create one or more linkages between items",
  inputSchema: {
    linkages: z.array(z.object({
      source_id: z.string(),
      target_id: z.string(),
      type_id: z.string(),
    })),
  },
});

server.registerTool("remove_linkages", {
  description: "Remove one or more linkages by ID",
  inputSchema: {
    ids: z.array(z.string()),
  },
});
```

No edit operation for linkages — a linkage is `(source, target, type)`, all three are identity. Changing any field is semantically delete + create.

### Removed standalone MCP tools

- `list_attributes` — folded into `get_item` and `list_items`
- `add_attribute` — folded into `update_item` (via `attributes.set`)
- `update_attribute` — folded into `update_item` (via `attributes.set`, upsert)
- `remove_attribute` — folded into `update_item` (via `attributes.remove`)
- `create_linkage` (singular) — replaced by `create_linkages` (batch)
- `remove_linkage` (singular) — replaced by `remove_linkages` (batch)

### Final MCP tool list (14 tools, down from 21)

| Tool | Mutation? | Notes |
|------|-----------|-------|
| `create_item` | yes | unchanged |
| `list_items` | no | + `as_of`; includes attributes inline |
| `get_item` | no | includes attributes + linkages; + `as_of` |
| `update_item` | yes | body + attribute set/remove in one call |
| `delete_item` | yes | unchanged |
| `list_linkages` | no | flat list; filterable by type/source/target; + `as_of` |
| `create_linkages` | yes | batch; accepts array of linkages |
| `remove_linkages` | yes | batch; accepts array of IDs |
| `list_attribute_types` | no | + `as_of` |
| `create_attribute_type` | yes | unchanged |
| `delete_attribute_type` | yes | unchanged |
| `list_linkage_types` | no | + `as_of` |
| `create_linkage_type` | yes | unchanged |
| `delete_linkage_type` | yes | unchanged |

All interfaces (REST, MCP, future CLI/GUI) expose full CRUD for all resources.

## 5. Summary of REST Changes

| Change | Detail |
|--------|--------|
| Add `?as_of` | All GET endpoints |
| Drop `/history` routes | 3 endpoints removed |
| Drop `?include` on GET /items/:id | Always return attributes + linkages |
| Richer `PATCH /items/:id` | Accept `attributes.set` and `attributes.remove` |
| Drop `GET /items/:id/linkages` | Folded into GET /items/:id |
| Drop `GET /items/:id/attributes` | Folded into GET /items/:id |
| `GET /items` returns attrs inline | Catalog view with attributes |
| Add `GET /linkages` | Flat filterable linkage list (?type_id, ?source_id, ?target_id) |
| Keep everything else | Standalone attribute endpoints, linkage CRUD, type CRUD unchanged |

## 6. Implementation Order

1. `asOfTable()` helper in `lib/dolt.ts` + tests (hash, timestamp, undefined)
2. Remove history endpoints, tools, and dolt functions (`doltLog`, `doltCommitDetails`, `doltItemHistory`, `DoltDiffItem`)
3. Wire `?as_of` / `as_of` param through all GET routes and read-only MCP tools
4. `GET /items/:id` — always inline attributes + linkages, drop `?include`, drop `/items/:id/attributes` and `/items/:id/linkages` sub-routes
5. Richer `PATCH /items/:id` — attribute set/remove
6. Consolidate MCP tools (merge attribute/linkage read tools into `get_item`, batch linkage mutations)
7. Update `docs/spec.md` to match
