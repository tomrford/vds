import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Kysely } from "kysely";
import { InUseError, NotFoundError } from "../../lib/errors.ts";
import type { Database } from "../schema.ts";
import { setupTestDb } from "../test-utils.ts";
import {
	createAttributeType,
	deleteAttributeType,
	listAttributeTypes,
} from "./attribute-types.ts";
import { addAttribute } from "./attributes.ts";
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

describe("attribute types", () => {
	test("create and list", async () => {
		const t = await createAttributeType(db, "at-1", "status");
		expect(t.name).toBe("status");

		const all = await listAttributeTypes(db);
		expect(all.some((x) => x.id === "at-1")).toBe(true);
	});

	test("delete unused", async () => {
		const t = await createAttributeType(db, "at-del", "deletable");
		await deleteAttributeType(db, t.id);
		const all = await listAttributeTypes(db);
		expect(all.some((x) => x.id === "at-del")).toBe(false);
	});

	test("delete in-use throws InUseError", async () => {
		const t = await createAttributeType(db, "at-used", "priority");
		const item = await createItem(db, "at-item-1", "test");
		await addAttribute(db, "attr-1", item.id, t.id, "high");
		expect(deleteAttributeType(db, t.id)).rejects.toBeInstanceOf(InUseError);
	});

	test("delete nonexistent throws NotFoundError", async () => {
		expect(deleteAttributeType(db, "nope")).rejects.toBeInstanceOf(
			NotFoundError,
		);
	});
});
