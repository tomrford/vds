import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Kysely } from "kysely";
import { NotFoundError } from "../../lib/errors.ts";
import type { Database } from "../schema.ts";
import { setupTestDb } from "../test-utils.ts";
import { createItem } from "./items.ts";
import { createLinkageType } from "./linkage-types.ts";
import {
	createLinkage,
	deleteLinkage,
	listLinkages,
} from "./linkages.ts";

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

describe("linkages", () => {
	test("create and list", async () => {
		const a = await createItem(db, "l-item-1", "alpha");
		const b = await createItem(db, "l-item-2", "beta");
		const lt = await createLinkageType(db, "l-lt-1", "related");
		const link = await createLinkage(db, "link-1", a.id, b.id, lt.id);
		expect(link.source_id).toBe(a.id);
		expect(link.target_id).toBe(b.id);

		const fromSource = await listLinkages(db, a.id, "source");
		expect(fromSource.length).toBe(1);

		const fromTarget = await listLinkages(db, b.id, "target");
		expect(fromTarget.length).toBe(1);

		const both = await listLinkages(db, a.id, "both");
		expect(both.length).toBe(1);
	});

	test("delete", async () => {
		await deleteLinkage(db, "link-1");
		expect(listLinkages(db, "l-item-1")).resolves.toHaveLength(0);
	});

	test("delete nonexistent throws", async () => {
		expect(deleteLinkage(db, "nope")).rejects.toBeInstanceOf(NotFoundError);
	});
});
