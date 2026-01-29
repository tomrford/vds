import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Kysely } from "kysely";
import { createItem } from "../db/queries/items.ts";
import type { Database } from "../db/schema.ts";
import { setupTestDb } from "../db/test-utils.ts";
import { asOfTable, doltCommit, withAutoCommit } from "./dolt.ts";

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

describe("asOfTable", () => {
	test("returns table name when undefined", () => {
		const query = db.selectFrom(asOfTable("items")).select("id").compile();
		expect(query.sql.toLowerCase()).not.toContain("as of");
	});

	test("uses AS OF for commit hash", () => {
		const query = db
			.selectFrom(asOfTable("items", "abc123"))
			.select("id")
			.compile();
		expect(query.sql.toLowerCase()).toContain("as of");
		expect(query.sql.toLowerCase()).not.toContain("timestamp");
	});

	test("uses AS OF TIMESTAMP for datetime", () => {
		const query = db
			.selectFrom(asOfTable("items", "2025-06-15T10:30:00Z"))
			.select("id")
			.compile();
		expect(query.sql.toLowerCase()).toContain("as of timestamp");
	});

	test("uses AS OF TIMESTAMP for date-only", () => {
		const query = db
			.selectFrom(asOfTable("items", "2025-06-15"))
			.select("id")
			.compile();
		expect(query.sql.toLowerCase()).toContain("as of timestamp");
	});
});
