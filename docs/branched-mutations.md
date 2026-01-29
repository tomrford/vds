# Branched Mutations

Replace strict optimistic concurrency with ephemeral-branch-and-merge. Non-conflicting parallel mutations succeed; true conflicts fail.

## Problem

Current model: every mutation checks `version == HEAD` before writing. Two parallel tool calls from the same `version` — second one always fails, even if they touch completely different data. Dolt is Git for SQL; we should use its merge machinery.

## Design

### Mutation Flow

```
1. DOLT_BRANCH('mut-<uuid>', '<version>')     -- fork from caller's version
2. DOLT_CHECKOUT('mut-<uuid>')                -- switch session to branch
3. <apply SQL mutations>                       -- INSERT/UPDATE/DELETE
4. DOLT_ADD('-A') + DOLT_COMMIT(msg)          -- commit on branch
5. DOLT_CHECKOUT('main')                       -- switch back
6. GET_LOCK('vds_merge', -1)                   -- serialize merges
7. DOLT_MERGE('mut-<uuid>')                    -- attempt merge
8a. conflicts == 0 → read HEAD, RELEASE_LOCK, delete branch → return new hash
8b. conflicts >  0 → DOLT_MERGE('--abort'), RELEASE_LOCK, delete branch → CONFLICT error
```

### Key Behaviors

- **Parallel-safe**: Two mutations from the same version fork independent branches. If they touch different rows/columns, both merge cleanly into main.
- **True conflicts fail**: Same (row, column) modified by both → merge conflict → error. Client must refetch and retry.
- **Merge serialization**: `GET_LOCK('vds_merge')` ensures only one merge-to-main at a time. Prevents branch pointer races. Lock held only during merge+cleanup — fast critical section.
- **Ephemeral branches**: Created and deleted within a single request. Never persist beyond the mutation lifecycle.

### Connection Considerations

Dolt branch state is per-session (per SQL connection). The mysql2 pool hands out connections from a shared pool. Two options:

**Option A — Dedicated connection per mutation (recommended)**

Acquire a raw connection from the pool, run the full branch lifecycle on it, release. Guarantees branch isolation. Kysely supports this via `db.connection.execute(async (conn) => { ... })`.

**Option B — Single-connection serial**

Route all mutations through one connection with GET_LOCK gating. Simpler but serializes all writes. Defeats the purpose.

→ Go with Option A.

### Version Parameter Semantics

- `version` provided: fork branch from that commit. If the commit is too old and merge conflicts, client gets CONFLICT.
- `version` omitted: fork from current HEAD. Equivalent to "I don't care about ordering, just apply my change."

### Error Semantics

- **CONFLICT** (merge failed): Client's base version diverged in a way that conflicts with concurrent mutations. Must refetch latest state and retry.
- No change to existing error types (NOT_FOUND, IN_USE, BAD_REQUEST). These fire before the merge attempt.

## Implementation

### 1. New `withBranchedCommit` in `lib/dolt.ts`

Replaces `withAutoCommit` for mutations. Signature:

```ts
async function withBranchedCommit<T>(
  db: Kysely<Database>,
  message: string,
  version: string | undefined,
  fn: (conn: Kysely<Database>) => Promise<T>,
): Promise<{ result: T; commitHash: string }>
```

Internally:
1. Acquire dedicated connection via `db.connection.execute()`
2. Generate branch name `mut-<uuid>`
3. Resolve base: `version ?? doltHead(conn)`
4. `CALL DOLT_BRANCH('mut-<uuid>', '<base>')`
5. `CALL DOLT_CHECKOUT('mut-<uuid>')`
6. Run `fn(conn)` — caller applies mutations
7. `CALL DOLT_ADD('-A')` + `CALL DOLT_COMMIT('-m', message)`
8. `CALL DOLT_CHECKOUT('main')`
9. `SELECT GET_LOCK('vds_merge', 10)` (10s timeout; fail if can't acquire)
10. `CALL DOLT_MERGE('mut-<uuid>')` → check `conflicts` column
11. If clean: read new HEAD, release lock, delete branch, return hash
12. If conflict: `CALL DOLT_MERGE('--abort')`, release lock, delete branch, throw ConflictError
13. Finally: ensure lock released + branch cleanup in all code paths

### 2. Update `tools.ts` and REST routes

- Remove `checkVersion()` — version handling moves into `withBranchedCommit`
- Replace `withAutoCommit(db, msg, fn)` → `withBranchedCommit(db, msg, version, fn)`
- `fn` now receives `conn` (the branch-scoped connection) instead of using the shared `db`

### 3. Query functions accept connection parameter

All query functions in `db/queries/*.ts` already accept `db: Kysely<Database>` as first arg. The branched commit passes the dedicated connection — no signature changes needed.

### 4. Cleanup safety

Branch deletion in a `finally` block. If the process crashes mid-mutation, orphan branches (`mut-*`) accumulate. Add a startup sweep:

```ts
// On server start: delete any lingering mut-* branches
CALL DOLT_BRANCH('-D', ...stale_branches)
```

Query `dolt_branches` table to find them.

## Not in Scope

- **Conflict resolution UI/API**: On conflict, fail. No three-way merge exposed to clients.
- **Long-lived branches**: All branches are ephemeral (single-request lifecycle).
- **Multi-table atomic merges**: Each mutation is one branch. Compound operations that need atomicity should be a single mutation call.

## Testing

- Two parallel mutations to different items from same version → both succeed
- Two parallel mutations to same item/attribute from same version → one succeeds, one CONFLICT
- Mutation with no version → succeeds (forks from HEAD)
- Mutation with stale version that doesn't conflict → succeeds (merge resolves)
- Mutation with stale version that does conflict → CONFLICT
- Orphan branch cleanup on startup
- Lock timeout behavior (merge lock held too long)
