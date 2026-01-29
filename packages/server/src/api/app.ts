import { Hono } from "hono";
import type { Kysely } from "kysely";
import type { Database } from "../db/schema.ts";
import { AppError } from "../lib/errors.ts";
import { mcpRoutes } from "./mcp.ts";
import { attributeTypeRoutes } from "./routes/attribute-types.ts";
import { attributeRoutes } from "./routes/attributes.ts";
import { itemRoutes } from "./routes/items.ts";
import { linkageTypeRoutes } from "./routes/linkage-types.ts";
import { linkageRoutes } from "./routes/linkages.ts";

export type Env = { Variables: { db: Kysely<Database> } };

export function createApp(db: Kysely<Database>) {
	const app = new Hono<Env>();

	// Inject db into context
	app.use("*", async (c, next) => {
		c.set("db", db);
		await next();
	});

	// Mount routes
	app.route("/items", itemRoutes);
	app.route("/attribute-types", attributeTypeRoutes);
	app.route("/attributes", attributeRoutes);
	app.route("/linkage-types", linkageTypeRoutes);
	app.route("/linkages", linkageRoutes);
	app.route("/mcp", mcpRoutes);

	// Global error handler
	app.onError((err, c) => {
		if (err instanceof AppError) {
			return c.json(
				{
					error: err.message,
					...(err.details ? { details: err.details } : {}),
				},
				err.status as 400,
			);
		}
		console.error("Unhandled error:", err);
		return c.json({ error: "Internal server error" }, 500);
	});

	return app;
}
