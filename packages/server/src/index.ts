export { createDb } from "./db/client.ts";
export { migrate } from "./db/migrate.ts";
export { doltCommit, doltHead, withAutoCommit } from "./lib/dolt.ts";
export { createApp } from "./api/app.ts";
export {
	AppError,
	NotFoundError,
	ConflictError,
	InUseError,
} from "./lib/errors.ts";

// Re-export query modules
export * as items from "./db/queries/items.ts";
export * as attributes from "./db/queries/attributes.ts";
export * as attributeTypes from "./db/queries/attribute-types.ts";
export * as linkages from "./db/queries/linkages.ts";
export * as linkageTypes from "./db/queries/linkage-types.ts";

// Re-export types
export type { Database } from "./db/schema.ts";
