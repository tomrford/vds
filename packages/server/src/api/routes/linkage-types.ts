import { Hono } from "hono";
import type { Env } from "../app.ts";
import * as linkageTypes from "../../db/queries/linkage-types.ts";
import { withAutoCommit } from "../../lib/dolt.ts";

export const linkageTypeRoutes = new Hono<Env>();

/** GET /linkage-types — List all types */
linkageTypeRoutes.get("/", async (c) => {
	const db = c.get("db");
	const result = await linkageTypes.listLinkageTypes(db);
	return c.json(result);
});

/** POST /linkage-types — Create type */
linkageTypeRoutes.post("/", async (c) => {
	const db = c.get("db");
	const { name } = await c.req.json<{ name: string }>();
	const id = crypto.randomUUID();

	const { result, commitHash } = await withAutoCommit(
		db,
		`Create linkage type ${name}`,
		() => linkageTypes.createLinkageType(db, id, name),
	);
	c.header("ETag", commitHash);
	return c.json(result, 201);
});

/** DELETE /linkage-types/:id — Delete type (fails if in use) */
linkageTypeRoutes.delete("/:id", async (c) => {
	const db = c.get("db");
	const id = c.req.param("id");

	const type = await linkageTypes.getLinkageType(db, id);
	const { commitHash } = await withAutoCommit(
		db,
		`Delete linkage type ${type.name}`,
		() => linkageTypes.deleteLinkageType(db, id),
	);
	c.header("ETag", commitHash);
	return c.body(null, 204);
});
