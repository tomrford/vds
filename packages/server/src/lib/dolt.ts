import type { Kysely } from "kysely";
import { sql } from "kysely";
import type { Database } from "../db/schema.ts";

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
