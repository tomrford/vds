import { Hono } from "hono";
import * as attributeTypes from "../../db/queries/attribute-types.ts";
import { withAutoCommit } from "../../lib/dolt.ts";
import type { Env } from "../app.ts";

export const attributeTypeRoutes = new Hono<Env>();

/** GET /attribute-types — List all types */
attributeTypeRoutes.get("/", async (c) => {
	const db = c.get("db");
	const asOf = c.req.query("as_of");
	const result = await attributeTypes.listAttributeTypes(db, asOf);
	return c.json(result);
});

/** POST /attribute-types — Create type */
attributeTypeRoutes.post("/", async (c) => {
	const db = c.get("db");
	const { name } = await c.req.json<{ name: string }>();
	const id = crypto.randomUUID();

	const { result, commitHash } = await withAutoCommit(
		db,
		`Create attribute type ${name}`,
		() => attributeTypes.createAttributeType(db, id, name),
	);
	c.header("ETag", commitHash);
	return c.json(result, 201);
});

/** DELETE /attribute-types/:id — Delete type (fails if in use) */
attributeTypeRoutes.delete("/:id", async (c) => {
	const db = c.get("db");
	const id = c.req.param("id");

	const type = await attributeTypes.getAttributeType(db, id);
	const { commitHash } = await withAutoCommit(
		db,
		`Delete attribute type ${type.name}`,
		() => attributeTypes.deleteAttributeType(db, id),
	);
	c.header("ETag", commitHash);
	return c.body(null, 204);
});
