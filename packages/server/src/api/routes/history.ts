import { Hono } from "hono";
import type { Env } from "../app.ts";
import { doltLog, doltCommitDetails } from "../../lib/dolt.ts";

export const historyRoutes = new Hono<Env>();

/** GET /history — List commits */
historyRoutes.get("/", async (c) => {
	const db = c.get("db");
	const limit = c.req.query("limit");
	const offset = c.req.query("offset");
	const commits = await doltLog(db, {
		limit: limit ? Number(limit) : undefined,
		offset: offset ? Number(offset) : undefined,
	});
	return c.json(commits);
});

/** GET /history/:commit — Get commit details */
historyRoutes.get("/:commit", async (c) => {
	const db = c.get("db");
	const hash = c.req.param("commit");
	const commit = await doltCommitDetails(db, hash);
	return c.json(commit);
});
