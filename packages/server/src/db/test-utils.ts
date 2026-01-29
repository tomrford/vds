import { type Kysely, sql } from "kysely";
import { createDb } from "./client.ts";
import { migrate } from "./migrate.ts";
import type { Database } from "./schema.ts";

interface TestDb {
	db: Kysely<Database>;
	cleanup: () => Promise<void>;
}

/**
 * Connect to an already-running Dolt server for testing.
 * The test script (scripts/test.sh) creates a "vds" Dolt database.
 * Each test file connects to it, runs migrations, and truncates on cleanup.
 */
export async function setupTestDb(): Promise<TestDb> {
	const port = Number(process.env.VDS_TEST_PORT ?? 3307);

	const db = createDb({
		host: "127.0.0.1",
		port,
		user: "root",
		password: "",
		database: "vds",
	});

	await migrate(db);

	// Commit schema so Dolt has a clean HEAD
	await sql`CALL DOLT_ADD('-A')`.execute(db);
	await sql`CALL DOLT_COMMIT('--allow-empty', '-m', ${"init"})`.execute(db);

	return {
		db,
		cleanup: async () => {
			// Truncate all tables to reset state
			await sql`DELETE FROM linkages`.execute(db);
			await sql`DELETE FROM attributes`.execute(db);
			await sql`DELETE FROM items`.execute(db);
			await sql`DELETE FROM linkage_types`.execute(db);
			await sql`DELETE FROM attribute_types`.execute(db);
			await db.destroy();
		},
	};
}
