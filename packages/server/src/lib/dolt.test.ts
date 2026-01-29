import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Kysely } from "kysely";
import type { Database } from "../db/schema.ts";
import { setupTestDb } from "../db/test-utils.ts";
import { createItem } from "../db/queries/items.ts";
import { doltCommit, withAutoCommit } from "./dolt.ts";

let db: Kysely<Database>;
let cleanup: () => Promise<void>;

beforeAll(async () => {
	const env = await setupTestDb();
	db = env.db;
	cleanup = env.cleanup;
});

afterAll(async () => {
	await cleanup();
});

describe("dolt auto-commit", () => {
	test("doltCommit returns hash", async () => {
		await db.insertInto("items").values({ id: "dc-1", body: "test" }).execute();
		const hash = await doltCommit(db, "test commit");
		expect(hash).toBeString();
		expect(hash.length).toBeGreaterThan(0);
	});

	test("withAutoCommit wraps mutation", async () => {
		const { result, commitHash } = await withAutoCommit(
			db,
			"Create item dc-2",
			async () => {
				return createItem(db, "dc-2", "auto-committed");
			},
		);
		expect(result.id).toBe("dc-2");
		expect(commitHash).toBeString();
		expect(commitHash.length).toBeGreaterThan(0);
	});
});
