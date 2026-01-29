import { Hono } from "hono";
import * as attributes from "../../db/queries/attributes.ts";
import { withAutoCommit } from "../../lib/dolt.ts";
import type { Env } from "../app.ts";

export const attributeRoutes = new Hono<Env>();

/** PATCH /attributes/:id — Update attribute value */
attributeRoutes.patch("/:id", async (c) => {
	const db = c.get("db");
	const id = c.req.param("id");
	const { value } = await c.req.json<{ value: string }>();

	const { result, commitHash } = await withAutoCommit(
		db,
		`Update attribute ${id}`,
		() => attributes.updateAttribute(db, id, value),
	);
	c.header("ETag", commitHash);
	return c.json(result);
});

/** DELETE /attributes/:id — Remove attribute */
attributeRoutes.delete("/:id", async (c) => {
	const db = c.get("db");
	const id = c.req.param("id");

	const { commitHash } = await withAutoCommit(
		db,
		`Remove attribute ${id}`,
		() => attributes.deleteAttribute(db, id),
	);
	c.header("ETag", commitHash);
	return c.body(null, 204);
});
