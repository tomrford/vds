import type { Kysely } from "kysely";
import { sql } from "kysely";
import type { Database } from "../db/schema.ts";
import { NotFoundError } from "./errors.ts";

export interface DoltCommitInfo {
	hash: string;
	committer: string;
	message: string;
	date: string;
}

export interface DoltDiffItem {
	table: string;
	diff_type: string;
	from_id: string | null;
	to_id: string | null;
}

/** Get current HEAD commit hash. */
export async function doltHead(db: Kysely<Database>): Promise<string> {
	const result = await sql<{ hash: string }>`
		SELECT DOLT_HASHOF('HEAD') AS hash
	`.execute(db);
	const row = result.rows[0];
	if (!row) throw new Error("DOLT_HASHOF returned no result");
	return row.hash;
}

/** Execute a Dolt commit with a message. Returns the commit hash. */
export async function doltCommit(
	db: Kysely<Database>,
	message: string,
): Promise<string> {
	// Stage all changes
	await sql`CALL DOLT_ADD('-A')`.execute(db);

	// Commit via stored procedure; returns the hash
	const result = await sql<{ hash: string }>`
		CALL DOLT_COMMIT('-m', ${message})
	`.execute(db);

	const row = result.rows[0];
	if (!row) throw new Error("DOLT_COMMIT returned no result");
	return row.hash;
}

/**
 * Run a mutation inside a Dolt auto-commit.
 * Executes `fn`, then commits with `message`.
 * Returns whatever `fn` returns plus the commit hash.
 */
export async function withAutoCommit<T>(
	db: Kysely<Database>,
	message: string,
	fn: () => Promise<T>,
): Promise<{ result: T; commitHash: string }> {
	const result = await fn();
	const commitHash = await doltCommit(db, message);
	return { result, commitHash };
}

/** List commits from Dolt log with optional pagination. */
export async function doltLog(
	db: Kysely<Database>,
	opts?: { limit?: number; offset?: number },
): Promise<DoltCommitInfo[]> {
	const limit = opts?.limit ?? 50;
	const offset = opts?.offset ?? 0;

	const result = await sql<DoltCommitInfo>`
		SELECT commit_hash AS hash, committer, message, date
		FROM dolt_log
		ORDER BY date DESC
		LIMIT ${limit} OFFSET ${offset}
	`.execute(db);

	return result.rows;
}

/** Get a single commit's details by hash. */
export async function doltCommitDetails(
	db: Kysely<Database>,
	hash: string,
): Promise<DoltCommitInfo> {
	const result = await sql<DoltCommitInfo>`
		SELECT commit_hash AS hash, committer, message, date
		FROM dolt_log
		WHERE commit_hash = ${hash}
	`.execute(db);

	const row = result.rows[0];
	if (!row) throw new NotFoundError("commit", hash);
	return row;
}

/** Get commits that changed a specific item (by scanning dolt_diff tables). */
export async function doltItemHistory(
	db: Kysely<Database>,
	itemId: string,
	opts?: { limit?: number; offset?: number },
): Promise<DoltCommitInfo[]> {
	const limit = opts?.limit ?? 50;
	const offset = opts?.offset ?? 0;

	// Find commits that touched this item in dolt_diff_items
	const result = await sql<DoltCommitInfo>`
		SELECT DISTINCT l.commit_hash AS hash, l.committer, l.message, l.date
		FROM dolt_log AS l
		JOIN dolt_diff_items AS d ON d.to_commit = l.commit_hash
		WHERE d.from_id = ${itemId} OR d.to_id = ${itemId}
		ORDER BY l.date DESC
		LIMIT ${limit} OFFSET ${offset}
	`.execute(db);

	return result.rows;
}
