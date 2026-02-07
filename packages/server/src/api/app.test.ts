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
	let createdHash: string | null = null;

	test("POST /items", async () => {
		const res = await post("/items", { body: "test item" });
		expect(res.status).toBe(201);
		const data: Any = await jsonBody(res);
		expect(data.body).toBe("test item");
		expect(data.id).toBeDefined();
		createdHash = res.headers.get("etag");
		expect(createdHash).toBeTruthy();
		itemId = data.id;
	});

	test("GET /items", async () => {
		const res = await req("/items");
		expect(res.status).toBe(200);
		const data: Any = await jsonBody(res);
		expect(data.length).toBeGreaterThanOrEqual(1);
		expect(data[0].attributes).toBeArray();
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

	test("GET /items/:id?as_of=hash", async () => {
		const res = await req(`/items/${itemId}?as_of=${createdHash ?? ""}`);
		expect(res.status).toBe(200);
		const data: Any = await jsonBody(res);
		expect(data.body).toBe("test item");
	});

	test("GET /items?as_of=hash", async () => {
		const res = await req(`/items?as_of=${createdHash ?? ""}`);
		expect(res.status).toBe(200);
		const data: Any = await jsonBody(res);
		const match = data.find((item: Any) => item.id === itemId);
		expect(match?.body).toBe("test item");
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
	let createHash: string | null = null;

	test("POST /attribute-types", async () => {
		const res = await post("/attribute-types", { name: "status" });
		expect(res.status).toBe(201);
		const data: Any = await jsonBody(res);
		expect(data.name).toBe("status");
		createHash = res.headers.get("etag");
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

	test("GET /attribute-types?as_of=hash", async () => {
		const res = await req(`/attribute-types?as_of=${createHash ?? ""}`);
		expect(res.status).toBe(200);
		const data: Any = await jsonBody(res);
		const match = data.find((type: Any) => type.id === typeId);
		expect(match?.name).toBe("status");
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

	test("PATCH /items/:id attributes.set", async () => {
		const res = await app.request(`/items/${itemId}`, {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				attributes: { set: [{ type_id: typeId, value: "high" }] },
			}),
		});
		expect(res.status).toBe(200);

		const getRes = await req(`/items/${itemId}`);
		const data: Any = await jsonBody(getRes);
		expect(data.attributes.length).toBe(1);
		expect(data.attributes[0].value).toBe("high");
		attrId = data.attributes[0].id;
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

	test("PATCH /items/:id attributes.remove", async () => {
		await app.request(`/items/${itemId}`, {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				attributes: { set: [{ type_id: typeId, value: "low" }] },
			}),
		});

		const res = await app.request(`/items/${itemId}`, {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				attributes: { remove: [typeId] },
			}),
		});
		expect(res.status).toBe(200);
		const getRes = await req(`/items/${itemId}`);
		const data: Any = await jsonBody(getRes);
		expect(data.attributes.length).toBe(0);
	});
});

describe("attribute filtering", () => {
	beforeAll(async () => {
		const typeRes = await post("/attribute-types", { name: "color" });
		const type: Any = await jsonBody(typeRes);
		const typeId = type.id;

		const r1 = await post("/items", { body: "red item" });
		const item1: Any = await jsonBody(r1);
		await app.request(`/items/${item1.id}`, {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				attributes: { set: [{ type_id: typeId, value: "red" }] },
			}),
		});

		const r2 = await post("/items", { body: "blue item" });
		const item2: Any = await jsonBody(r2);
		await app.request(`/items/${item2.id}`, {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				attributes: { set: [{ type_id: typeId, value: "blue" }] },
			}),
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
	let createHash: string | null = null;

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
		createHash = res.headers.get("etag");
		linkageId = data.id;
	});

	test("GET /linkages?source_id", async () => {
		const res = await req(`/linkages?source_id=${sourceId}`);
		expect(res.status).toBe(200);
		const data: Any = await jsonBody(res);
		expect(data.length).toBe(1);
	});

	test("GET /linkages?target_id", async () => {
		const res = await req(`/linkages?target_id=${targetId}`);
		const data: Any = await jsonBody(res);
		expect(data.length).toBe(1);
	});

	test("GET /items/:id includes linkages", async () => {
		const res = await req(`/items/${sourceId}`);
		const data: Any = await jsonBody(res);
		expect(data.linkages).toBeArray();
		expect(data.linkages.length).toBe(1);
	});

	test("DELETE /linkages/:id", async () => {
		const res = await app.request(`/linkages/${linkageId}`, {
			method: "DELETE",
		});
		expect(res.status).toBe(204);
	});

	test("GET /linkages?as_of=hash", async () => {
		const res = await req(`/linkages?as_of=${createHash ?? ""}`);
		expect(res.status).toBe(200);
		const data: Any = await jsonBody(res);
		const match = data.find((linkage: Any) => linkage.id === linkageId);
		expect(match?.id).toBe(linkageId);
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

describe("schema blob", () => {
	let v1Hash: string | null = null;

	test("GET /schema returns null body when unset", async () => {
		const res = await req("/schema");
		expect(res.status).toBe(200);
		const data: Any = await jsonBody(res);
		expect(data.body).toBeNull();
	});

	test("PUT /schema sets schema blob", async () => {
		const res = await app.request("/schema", {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ body: "types:\\n  requirement:\\n    attrs: []" }),
		});
		expect(res.status).toBe(200);
		const data: Any = await jsonBody(res);
		expect(data.body).toContain("requirement");
		v1Hash = res.headers.get("etag");
		expect(v1Hash).toBeTruthy();
	});

	test("GET /schema returns latest blob", async () => {
		const res = await req("/schema");
		const data: Any = await jsonBody(res);
		expect(data.body).toContain("requirement");
	});

	test("GET /schema?as_of=hash returns previous blob", async () => {
		const res2 = await app.request("/schema", {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ body: "types:\\n  information:\\n    attrs: []" }),
		});
		expect(res2.status).toBe(200);

		const res = await req(`/schema?as_of=${v1Hash ?? ""}`);
		const data: Any = await jsonBody(res);
		expect(data.body).toContain("requirement");
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
