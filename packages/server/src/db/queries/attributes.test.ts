import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Kysely } from "kysely";
import { NotFoundError } from "../../lib/errors.ts";
import type { Database } from "../schema.ts";
import { setupTestDb } from "../test-utils.ts";
import { createAttributeType } from "./attribute-types.ts";
import {
	addAttribute,
	deleteAttribute,
	getAttribute,
	listAttributes,
	updateAttribute,
} from "./attributes.ts";
import { createItem } from "./items.ts";

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

describe("attributes", () => {
	test("add and list", async () => {
		const item = await createItem(db, "a-item-1", "body");
		const attrType = await createAttributeType(db, "a-at-1", "color");
		const attr = await addAttribute(db, "a-1", item.id, attrType.id, "blue");
		expect(attr.value).toBe("blue");

		const all = await listAttributes(db, item.id);
		expect(all.length).toBe(1);
		expect(all[0]?.value).toBe("blue");
	});

	test("update", async () => {
		const updated = await updateAttribute(db, "a-1", "red");
		expect(updated.value).toBe("red");
	});

	test("delete", async () => {
		await deleteAttribute(db, "a-1");
		expect(getAttribute(db, "a-1")).rejects.toBeInstanceOf(NotFoundError);
	});
});
