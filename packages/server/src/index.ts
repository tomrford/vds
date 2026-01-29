export { createApp } from "./api/app.ts";
export { createDb } from "./db/client.ts";
export { migrate } from "./db/migrate.ts";
export * as attributeTypes from "./db/queries/attribute-types.ts";
export * as attributes from "./db/queries/attributes.ts";
// Re-export query modules
export * as items from "./db/queries/items.ts";
export * as linkageTypes from "./db/queries/linkage-types.ts";
export * as linkages from "./db/queries/linkages.ts";
// Re-export types
export type { Database } from "./db/schema.ts";
export {
	asOfTable,
	doltCommit,
	doltHead,
	withAutoCommit,
} from "./lib/dolt.ts";
export {
	AppError,
	ConflictError,
	InUseError,
	NotFoundError,
} from "./lib/errors.ts";
export { createMcpServer } from "./mcp/server.ts";
