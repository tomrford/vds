import { Hono } from "hono";
import type { Env } from "../app.ts";
import * as items from "../../db/queries/items.ts";
import * as attributes from "../../db/queries/attributes.ts";
import * as linkages from "../../db/queries/linkages.ts";
import {
	doltHead,
	doltItemHistory,
	withAutoCommit,
} from "../../lib/dolt.ts";

export const itemRoutes = new Hono<Env>();

/** POST /items — Create item */
itemRoutes.post("/", async (c) => {
	const db = c.get("db");
	const { body } = await c.req.json<{ body: string }>();
	const id = crypto.randomUUID();

	const ifMatch = c.req.header("If-Match");
	if (ifMatch) {
		const head = await doltHead(db);
		if (head !== ifMatch) {
			return c.json({ error: "Conflict", details: { head } }, 409);
		}
	}

	const { result, commitHash } = await withAutoCommit(
		db,
		`Create item ${id}`,
		() => items.createItem(db, id, body),
	);
	c.header("ETag", commitHash);
	return c.json(result, 201);
});

/** GET /items — List items */
itemRoutes.get("/", async (c) => {
	const db = c.get("db");
	const limit = c.req.query("limit");
	const offset = c.req.query("offset");

	// Attribute filtering: ?attr.<type_name>=<value>
	const attrFilters: { name: string; value: string }[] = [];
	for (const [key, value] of Object.entries(c.req.queries())) {
		if (key.startsWith("attr.") && value[0] !== undefined) {
			attrFilters.push({ name: key.slice(5), value: value[0] });
		}
	}

	const result = await items.listItems(db, {
		limit: limit ? Number(limit) : undefined,
		offset: offset ? Number(offset) : undefined,
		attrFilters: attrFilters.length > 0 ? attrFilters : undefined,
	});

	return c.json(result);
});

/** GET /items/:id — Get item with optional includes */
itemRoutes.get("/:id", async (c) => {
	const db = c.get("db");
	const id = c.req.param("id");
	const include = c.req.query("include")?.split(",") ?? [];

	const item = await items.getItem(db, id);

	const response: Record<string, unknown> = { ...item };
	if (include.includes("attributes")) {
		response.attributes = await attributes.listAttributes(db, id);
	}
	if (include.includes("linkages")) {
		response.linkages = await linkages.listLinkages(db, id);
	}

	return c.json(response);
});

/** PATCH /items/:id — Update item */
itemRoutes.patch("/:id", async (c) => {
	const db = c.get("db");
	const id = c.req.param("id");
	const { body } = await c.req.json<{ body: string }>();

	const ifMatch = c.req.header("If-Match");
	if (ifMatch) {
		const head = await doltHead(db);
		if (head !== ifMatch) {
			return c.json({ error: "Conflict", details: { head } }, 409);
		}
	}

	const { result, commitHash } = await withAutoCommit(
		db,
		`Update item ${id}`,
		() => items.updateItem(db, id, body),
	);
	c.header("ETag", commitHash);
	return c.json(result);
});

/** DELETE /items/:id — Delete item (cascades) */
itemRoutes.delete("/:id", async (c) => {
	const db = c.get("db");
	const id = c.req.param("id");

	const ifMatch = c.req.header("If-Match");
	if (ifMatch) {
		const head = await doltHead(db);
		if (head !== ifMatch) {
			return c.json({ error: "Conflict", details: { head } }, 409);
		}
	}

	const { commitHash } = await withAutoCommit(
		db,
		`Delete item ${id}`,
		() => items.deleteItem(db, id),
	);
	c.header("ETag", commitHash);
	return c.body(null, 204);
});

/** GET /items/:id/attributes — List attributes for item */
itemRoutes.get("/:id/attributes", async (c) => {
	const db = c.get("db");
	const id = c.req.param("id");
	// Verify item exists
	await items.getItem(db, id);
	const result = await attributes.listAttributes(db, id);
	return c.json(result);
});

/** POST /items/:id/attributes — Add attribute to item */
itemRoutes.post("/:id/attributes", async (c) => {
	const db = c.get("db");
	const itemId = c.req.param("id");
	const { type_id, value } = await c.req.json<{
		type_id: string;
		value: string;
	}>();
	const id = crypto.randomUUID();

	// Verify item exists
	await items.getItem(db, itemId);

	const { result, commitHash } = await withAutoCommit(
		db,
		`Add attribute to item ${itemId}`,
		() => attributes.addAttribute(db, id, itemId, type_id, value),
	);
	c.header("ETag", commitHash);
	return c.json(result, 201);
});

/** GET /items/:id/linkages — Get linkages for item */
itemRoutes.get("/:id/linkages", async (c) => {
	const db = c.get("db");
	const id = c.req.param("id");
	const direction = c.req.query("direction") as
		| "source"
		| "target"
		| "both"
		| undefined;
	// Verify item exists
	await items.getItem(db, id);
	const result = await linkages.listLinkages(db, id, direction);
	return c.json(result);
});

/** GET /items/:id/history — Get item's change history */
itemRoutes.get("/:id/history", async (c) => {
	const db = c.get("db");
	const id = c.req.param("id");
	const limit = c.req.query("limit");
	const offset = c.req.query("offset");
	// Verify item exists
	await items.getItem(db, id);
	const commits = await doltItemHistory(db, id, {
		limit: limit ? Number(limit) : undefined,
		offset: offset ? Number(offset) : undefined,
	});
	return c.json(commits);
});
