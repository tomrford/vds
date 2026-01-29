import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Kysely } from "kysely";
import { NotFoundError } from "../../lib/errors.ts";
import type { Database } from "../schema.ts";
import { setupTestDb } from "../test-utils.ts";
import {
	createItem,
	deleteItem,
	getItem,
	listItems,
	updateItem,
} from "./items.ts";

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

describe("items", () => {
	test("create and get", async () => {
		const item = await createItem(db, "test-id-1", "hello world");
		expect(item.id).toBe("test-id-1");
		expect(item.body).toBe("hello world");

		const fetched = await getItem(db, "test-id-1");
		expect(fetched.id).toBe("test-id-1");
		expect(fetched.body).toBe("hello world");
	});

	test("list", async () => {
		await createItem(db, "test-id-2", "second item");
		const all = await listItems(db);
		expect(all.length).toBeGreaterThanOrEqual(2);
	});

	test("list with limit/offset", async () => {
		const limited = await listItems(db, { limit: 1 });
		expect(limited.length).toBe(1);
	});

	test("update", async () => {
		const updated = await updateItem(db, "test-id-1", "updated body");
		expect(updated.body).toBe("updated body");
	});

	test("delete", async () => {
		await deleteItem(db, "test-id-1");
		expect(getItem(db, "test-id-1")).rejects.toBeInstanceOf(NotFoundError);
	});

	test("get nonexistent throws NotFoundError", async () => {
		expect(getItem(db, "nonexistent")).rejects.toBeInstanceOf(NotFoundError);
	});
});
