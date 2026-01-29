import { Hono } from "hono";
import type { Env } from "../app.ts";
import * as linkages from "../../db/queries/linkages.ts";
import { withAutoCommit } from "../../lib/dolt.ts";

export const linkageRoutes = new Hono<Env>();

/** POST /linkages — Create linkage */
linkageRoutes.post("/", async (c) => {
	const db = c.get("db");
	const { source_id, target_id, type_id } = await c.req.json<{
		source_id: string;
		target_id: string;
		type_id: string;
	}>();
	const id = crypto.randomUUID();

	const { result, commitHash } = await withAutoCommit(
		db,
		`Link ${source_id} -> ${target_id}`,
		() => linkages.createLinkage(db, id, source_id, target_id, type_id),
	);
	c.header("ETag", commitHash);
	return c.json(result, 201);
});

/** DELETE /linkages/:id — Remove linkage */
linkageRoutes.delete("/:id", async (c) => {
	const db = c.get("db");
	const id = c.req.param("id");

	const { commitHash } = await withAutoCommit(
		db,
		`Remove linkage ${id}`,
		() => linkages.deleteLinkage(db, id),
	);
	c.header("ETag", commitHash);
	return c.body(null, 204);
});
