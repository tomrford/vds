import type { AliasedRawBuilder, Kysely } from "kysely";
import { sql } from "kysely";
import type { Database } from "../db/schema.ts";

export interface DoltCommitInfo {
	hash: string;
	committer: string;
	message: string;
	date: string;
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

/** Build a table expression with optional AS OF clause for point-in-time queries. */
export function asOfTable<T extends keyof Database>(
	table: T,
	asOf?: string,
): AliasedRawBuilder<Database[T], T> {
	const base = sql.table(table);
	if (!asOf) return base.as(table) as AliasedRawBuilder<Database[T], T>;
	if (asOf.includes("T") || /^\d{4}-/.test(asOf)) {
		return sql`${base} AS OF TIMESTAMP(${asOf})`.as(table) as AliasedRawBuilder<
			Database[T],
			T
		>;
	}
	return sql`${base} AS OF ${asOf}`.as(table) as AliasedRawBuilder<
		Database[T],
		T
	>;
}
