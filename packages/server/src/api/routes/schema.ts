import { Hono } from "hono";
import * as schemaBlob from "../../db/queries/schema-blob.ts";
import { doltHead, withAutoCommit } from "../../lib/dolt.ts";
import type { Env } from "../app.ts";

export const schemaRoutes = new Hono<Env>();

/** GET /schema — Get schema blob */
schemaRoutes.get("/", async (c) => {
	const db = c.get("db");
	const asOf = c.req.query("as_of");
	const result = await schemaBlob.getSchemaBlob(db, asOf);
	return c.json(result ?? { body: null });
});

/** PUT /schema — Set schema blob */
schemaRoutes.put("/", async (c) => {
	const db = c.get("db");
	const payload = await c.req.json<{ body?: string }>();
	if (typeof payload.body !== "string") {
		return c.json({ error: "Body is required" }, 400);
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
		"Set schema blob",
		() => schemaBlob.setSchemaBlob(db, payload.body ?? ""),
	);
	c.header("ETag", commitHash);
	return c.json(result ?? { body: payload.body ?? "" });
});
