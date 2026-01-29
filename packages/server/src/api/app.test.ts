import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Kysely } from "kysely";
import type { Database } from "../db/schema.ts";
import { setupTestDb } from "../db/test-utils.ts";
import { createApp } from "./app.ts";

// biome-ignore lint/suspicious/noExplicitAny: test convenience
type Any = any;

let db: Kysely<Database>;
let cleanup: () => Promise<void>;
let app: ReturnType<typeof createApp>;

beforeAll(async () => {
	const env = await setupTestDb();
	db = env.db;
	cleanup = env.cleanup;
	app = createApp(db);
});

afterAll(async () => {
	await cleanup();
});

function req(path: string, init?: RequestInit) {
	return app.request(path, init);
}

async function post(path: string, body: unknown, init?: RequestInit) {
	const res = await app.request(path, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
		...init,
	});
	return res;
}

async function jsonBody(res: Response): Promise<Any> {
	return res.json();
}

describe("items CRUD", () => {
	let itemId: string;

	test("POST /items", async () => {
		const res = await post("/items", { body: "test item" });
		expect(res.status).toBe(201);
		const data: Any = await jsonBody(res);
		expect(data.body).toBe("test item");
		expect(data.id).toBeDefined();
		expect(res.headers.get("etag")).toBeTruthy();
		itemId = data.id;
	});

	test("GET /items", async () => {
		const res = await req("/items");
		expect(res.status).toBe(200);
		const data: Any = await jsonBody(res);
		expect(data.length).toBeGreaterThanOrEqual(1);
	});

	test("GET /items?limit=1", async () => {
		await post("/items", { body: "second" });
		const res = await req("/items?limit=1");
		const data: Any = await jsonBody(res);
		expect(data.length).toBe(1);
	});

	test("GET /items/:id", async () => {
		const res = await req(`/items/${itemId}`);
		expect(res.status).toBe(200);
		const data: Any = await jsonBody(res);
		expect(data.id).toBe(itemId);
		expect(data.body).toBe("test item");
	});

	test("GET /items/:id?include=attributes,linkages", async () => {
		const res = await req(`/items/${itemId}?include=attributes,linkages`);
		const data: Any = await jsonBody(res);
		expect(data.attributes).toBeArray();
		expect(data.linkages).toBeArray();
	});

	test("PATCH /items/:id", async () => {
		const res = await app.request(`/items/${itemId}`, {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ body: "updated" }),
		});
		expect(res.status).toBe(200);
		const data: Any = await jsonBody(res);
		expect(data.body).toBe("updated");
		expect(res.headers.get("etag")).toBeTruthy();
	});

	test("GET /items/:id — 404", async () => {
		const res = await req("/items/nonexistent");
		expect(res.status).toBe(404);
		const data: Any = await jsonBody(res);
		expect(data.error).toContain("not found");
	});

	test("DELETE /items/:id", async () => {
		const res = await app.request(`/items/${itemId}`, { method: "DELETE" });
		expect(res.status).toBe(204);
		const check = await req(`/items/${itemId}`);
		expect(check.status).toBe(404);
	});
});

describe("attribute types", () => {
	let typeId: string;

	test("POST /attribute-types", async () => {
		const res = await post("/attribute-types", { name: "status" });
		expect(res.status).toBe(201);
		const data: Any = await jsonBody(res);
		expect(data.name).toBe("status");
		typeId = data.id;
	});

	test("GET /attribute-types", async () => {
		const res = await req("/attribute-types");
		expect(res.status).toBe(200);
		const data: Any = await jsonBody(res);
		expect(data.length).toBeGreaterThanOrEqual(1);
	});

	test("DELETE /attribute-types/:id", async () => {
		const res = await app.request(`/attribute-types/${typeId}`, {
			method: "DELETE",
		});
		expect(res.status).toBe(204);
	});
});

describe("attributes", () => {
	let itemId: string;
	let typeId: string;
	let attrId: string;

	beforeAll(async () => {
		const itemRes = await post("/items", { body: "attr test" });
		const item: Any = await jsonBody(itemRes);
		itemId = item.id;

		const typeRes = await post("/attribute-types", { name: "priority" });
		const type: Any = await jsonBody(typeRes);
		typeId = type.id;
	});

	test("POST /items/:id/attributes", async () => {
		const res = await post(`/items/${itemId}/attributes`, {
			type_id: typeId,
			value: "high",
		});
		expect(res.status).toBe(201);
		const data: Any = await jsonBody(res);
		expect(data.value).toBe("high");
		expect(data.item_id).toBe(itemId);
		attrId = data.id;
	});

	test("GET /items/:id/attributes", async () => {
		const res = await req(`/items/${itemId}/attributes`);
		expect(res.status).toBe(200);
		const data: Any = await jsonBody(res);
		expect(data.length).toBe(1);
		expect(data[0].value).toBe("high");
	});

	test("PATCH /attributes/:id", async () => {
		const res = await app.request(`/attributes/${attrId}`, {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ value: "low" }),
		});
		expect(res.status).toBe(200);
		const data: Any = await jsonBody(res);
		expect(data.value).toBe("low");
	});

	test("DELETE /attributes/:id", async () => {
		const res = await app.request(`/attributes/${attrId}`, {
			method: "DELETE",
		});
		expect(res.status).toBe(204);
	});
});

describe("attribute filtering", () => {
	beforeAll(async () => {
		const typeRes = await post("/attribute-types", { name: "color" });
		const type: Any = await jsonBody(typeRes);
		const typeId = type.id;

		const r1 = await post("/items", { body: "red item" });
		const item1: Any = await jsonBody(r1);
		await post(`/items/${item1.id}/attributes`, {
			type_id: typeId,
			value: "red",
		});

		const r2 = await post("/items", { body: "blue item" });
		const item2: Any = await jsonBody(r2);
		await post(`/items/${item2.id}/attributes`, {
			type_id: typeId,
			value: "blue",
		});
	});

	test("GET /items?attr.color=red filters correctly", async () => {
		const res = await req("/items?attr.color=red");
		const data: Any = await jsonBody(res);
		expect(data.length).toBeGreaterThanOrEqual(1);
		for (const item of data) {
			expect(item.body).toContain("red");
		}
	});
});

describe("linkage types", () => {
	let typeId: string;

	test("POST /linkage-types", async () => {
		const res = await post("/linkage-types", { name: "depends_on" });
		expect(res.status).toBe(201);
		const data: Any = await jsonBody(res);
		expect(data.name).toBe("depends_on");
		typeId = data.id;
	});

	test("GET /linkage-types", async () => {
		const res = await req("/linkage-types");
		expect(res.status).toBe(200);
		const data: Any = await jsonBody(res);
		expect(data.length).toBeGreaterThanOrEqual(1);
	});

	test("DELETE /linkage-types/:id", async () => {
		const res = await app.request(`/linkage-types/${typeId}`, {
			method: "DELETE",
		});
		expect(res.status).toBe(204);
	});
});

describe("linkages", () => {
	let sourceId: string;
	let targetId: string;
	let typeId: string;
	let linkageId: string;

	beforeAll(async () => {
		const r1: Any = await jsonBody(await post("/items", { body: "source" }));
		sourceId = r1.id;
		const r2: Any = await jsonBody(await post("/items", { body: "target" }));
		targetId = r2.id;
		const r3: Any = await jsonBody(
			await post("/linkage-types", { name: "blocks" }),
		);
		typeId = r3.id;
	});

	test("POST /linkages", async () => {
		const res = await post("/linkages", {
			source_id: sourceId,
			target_id: targetId,
			type_id: typeId,
		});
		expect(res.status).toBe(201);
		const data: Any = await jsonBody(res);
		expect(data.source_id).toBe(sourceId);
		expect(data.target_id).toBe(targetId);
		linkageId = data.id;
	});

	test("GET /items/:id/linkages", async () => {
		const res = await req(`/items/${sourceId}/linkages`);
		expect(res.status).toBe(200);
		const data: Any = await jsonBody(res);
		expect(data.length).toBe(1);
	});

	test("GET /items/:id/linkages?direction=source", async () => {
		const res = await req(`/items/${sourceId}/linkages?direction=source`);
		const data: Any = await jsonBody(res);
		expect(data.length).toBe(1);
	});

	test("GET /items/:id/linkages?direction=target (from source)", async () => {
		const res = await req(`/items/${sourceId}/linkages?direction=target`);
		const data: Any = await jsonBody(res);
		expect(data.length).toBe(0);
	});

	test("DELETE /linkages/:id", async () => {
		const res = await app.request(`/linkages/${linkageId}`, {
			method: "DELETE",
		});
		expect(res.status).toBe(204);
	});

	test("DELETE /linkage-types/:id — in use fails", async () => {
		const lr = await post("/linkages", {
			source_id: sourceId,
			target_id: targetId,
			type_id: typeId,
		});
		expect(lr.status).toBe(201);

		const res = await app.request(`/linkage-types/${typeId}`, {
			method: "DELETE",
		});
		expect(res.status).toBe(409);
	});
});

describe("optimistic locking", () => {
	test("If-Match with stale hash returns 409", async () => {
		const res = await app.request("/items", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"If-Match": "stale-hash-value",
			},
			body: JSON.stringify({ body: "conflict test" }),
		});
		expect(res.status).toBe(409);
		const data: Any = await jsonBody(res);
		expect(data.error).toBe("Conflict");
		expect(data.details.head).toBeTruthy();
	});

	test("If-Match with current hash succeeds", async () => {
		const r1 = await post("/items", { body: "get hash" });
		const etag = r1.headers.get("etag");

		const res = await app.request("/items", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"If-Match": etag ?? "",
			},
			body: JSON.stringify({ body: "with match" }),
		});
		expect(res.status).toBe(201);
	});
});
