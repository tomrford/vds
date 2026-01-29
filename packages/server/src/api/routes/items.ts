import { Hono } from "hono";
import * as attributes from "../../db/queries/attributes.ts";
import * as items from "../../db/queries/items.ts";
import * as linkages from "../../db/queries/linkages.ts";
import { doltHead, withAutoCommit } from "../../lib/dolt.ts";
import type { Env } from "../app.ts";

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
	const asOf = c.req.query("as_of");

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
		asOf,
	});

	return c.json(result);
});

/** GET /items/:id — Get item with attributes and linkages */
itemRoutes.get("/:id", async (c) => {
	const db = c.get("db");
	const id = c.req.param("id");
	const asOf = c.req.query("as_of");

	const item = await items.getItem(db, id, asOf);
	const response = {
		...item,
		attributes: await attributes.listAttributes(db, id, asOf),
		linkages: await linkages.listLinkagesForItem(db, id, "both", asOf),
	};
	return c.json(response);
});

/** PATCH /items/:id — Update item */
itemRoutes.patch("/:id", async (c) => {
	const db = c.get("db");
	const id = c.req.param("id");
	const payload = await c.req.json<{
		body?: string;
		attributes?: {
			set?: { type_id: string; value: string }[];
			remove?: string[];
		};
	}>();
	const body = payload.body;
	const setAttributes = payload.attributes?.set ?? [];
	const removeAttributes = payload.attributes?.remove ?? [];
	if (
		body === undefined &&
		setAttributes.length === 0 &&
		removeAttributes.length === 0
	) {
		return c.json({ error: "No updates provided" }, 400);
	}

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
		async () => {
			if (body !== undefined) {
				await items.updateItem(db, id, body);
			} else {
				await items.getItem(db, id);
			}

			for (const attr of setAttributes) {
				await attributes.upsertAttribute(db, id, attr.type_id, attr.value);
			}

			if (removeAttributes.length > 0) {
				await attributes.deleteAttributesByTypeIds(db, id, removeAttributes);
			}

			return items.getItem(db, id);
		},
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

	const { commitHash } = await withAutoCommit(db, `Delete item ${id}`, () =>
		items.deleteItem(db, id),
	);
	c.header("ETag", commitHash);
	return c.body(null, 204);
});
