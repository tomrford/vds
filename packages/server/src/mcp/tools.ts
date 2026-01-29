import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Kysely } from "kysely";
import { z } from "zod";
import * as attributeTypes from "../db/queries/attribute-types.ts";
import * as attributes from "../db/queries/attributes.ts";
import * as items from "../db/queries/items.ts";
import * as linkageTypes from "../db/queries/linkage-types.ts";
import * as linkages from "../db/queries/linkages.ts";
import type { Database } from "../db/schema.ts";
import { doltHead, withAutoCommit } from "../lib/dolt.ts";
import {
	AppError,
	ConflictError,
	InUseError,
	NotFoundError,
} from "../lib/errors.ts";
import { type McpTextResult, mcpErr, mcpOk } from "./response.ts";

function toMcpError(err: unknown): McpTextResult {
	if (err instanceof InUseError) {
		return mcpErr("IN_USE", err.message, err.details);
	}
	if (err instanceof NotFoundError) {
		return mcpErr("NOT_FOUND", err.message, err.details);
	}
	if (err instanceof ConflictError) {
		return mcpErr("CONFLICT", err.message, err.details);
	}
	if (err instanceof AppError) {
		return mcpErr("BAD_REQUEST", err.message, err.details);
	}
	if (err instanceof Error) {
		return mcpErr("INTERNAL", err.message);
	}
	return mcpErr("INTERNAL", "Unknown error");
}

async function handleMcp(
	fn: () => Promise<McpTextResult>,
): Promise<McpTextResult> {
	try {
		return await fn();
	} catch (err) {
		return toMcpError(err);
	}
}

async function checkVersion(
	db: Kysely<Database>,
	version?: string,
): Promise<string | null> {
	if (!version) return null;
	const head = await doltHead(db);
	if (head !== version) return head;
	return null;
}

export function registerTools(server: McpServer, db: Kysely<Database>) {
	// ── Items ──────────────────────────────────────────────

	server.registerTool(
		"create_item",
		{
			description: "Create a new item",
			inputSchema: {
				body: z.string().describe("Item body text"),
				version: z.string().optional().describe("Expected HEAD commit hash"),
			},
		},
		async ({ body, version }) => {
			return handleMcp(async () => {
				const head = await checkVersion(db, version);
				if (head) return mcpErr("CONFLICT", "Conflict", { head });
				const id = crypto.randomUUID();
				const { result, commitHash } = await withAutoCommit(
					db,
					`Create item ${id}`,
					() => items.createItem(db, id, body),
				);
				return mcpOk(result, commitHash);
			});
		},
	);

	server.registerTool(
		"list_items",
		{
			description: "List items with optional pagination and attribute filters",
			inputSchema: {
				limit: z.number().optional().describe("Max results"),
				offset: z.number().optional().describe("Skip N results"),
				filters: z
					.record(z.string(), z.string())
					.optional()
					.describe("Attribute filters as { typeName: value }"),
				as_of: z
					.string()
					.optional()
					.describe("Commit hash or datetime for point-in-time read"),
			},
		},
		async ({ limit, offset, filters, as_of }) => {
			return handleMcp(async () => {
				const attrFilters = filters
					? Object.entries(filters).map(([name, value]) => ({ name, value }))
					: undefined;
				const result = await items.listItems(db, {
					limit,
					offset,
					attrFilters,
					asOf: as_of,
				});
				const version = await doltHead(db);
				return mcpOk(result, version);
			});
		},
	);

	server.registerTool(
		"get_item",
		{
			description: "Get an item with its attributes and linkages",
			inputSchema: {
				id: z.string().describe("Item ID"),
				as_of: z
					.string()
					.optional()
					.describe("Commit hash or datetime for point-in-time read"),
			},
		},
		async ({ id, as_of }) => {
			return handleMcp(async () => {
				const item = await items.getItem(db, id, as_of);
				const response = {
					...item,
					attributes: await attributes.listAttributes(db, id, as_of),
					linkages: await linkages.listLinkagesForItem(db, id, "both", as_of),
				};
				const version = await doltHead(db);
				return mcpOk(response, version);
			});
		},
	);

	server.registerTool(
		"update_item",
		{
			description: "Update an item: body, attributes, or both",
			inputSchema: {
				id: z.string().describe("Item ID"),
				body: z.string().optional().describe("New body text"),
				version: z.string().optional().describe("Expected HEAD commit hash"),
				attributes: z
					.object({
						set: z
							.array(
								z.object({
									type_id: z.string(),
									value: z.string(),
								}),
							)
							.optional(),
						remove: z
							.array(z.string())
							.optional()
							.describe("Attribute type_ids to remove"),
					})
					.optional(),
			},
		},
		async ({ id, body, version, attributes: attrs }) => {
			return handleMcp(async () => {
				const setAttributes = attrs?.set ?? [];
				const removeAttributes = attrs?.remove ?? [];
				if (
					body === undefined &&
					setAttributes.length === 0 &&
					removeAttributes.length === 0
				) {
					return mcpErr("BAD_REQUEST", "No updates provided");
				}

				const head = await checkVersion(db, version);
				if (head) return mcpErr("CONFLICT", "Conflict", { head });

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
							await attributes.upsertAttribute(
								db,
								id,
								attr.type_id,
								attr.value,
							);
						}

						if (removeAttributes.length > 0) {
							await attributes.deleteAttributesByTypeIds(
								db,
								id,
								removeAttributes,
							);
						}

						return items.getItem(db, id);
					},
				);
				return mcpOk(result, commitHash);
			});
		},
	);

	server.registerTool(
		"delete_item",
		{
			description: "Delete an item and its attributes/linkages",
			inputSchema: {
				id: z.string().describe("Item ID"),
				version: z.string().optional().describe("Expected HEAD commit hash"),
			},
		},
		async ({ id, version }) => {
			return handleMcp(async () => {
				const head = await checkVersion(db, version);
				if (head) return mcpErr("CONFLICT", "Conflict", { head });
				const { commitHash } = await withAutoCommit(
					db,
					`Delete item ${id}`,
					() => items.deleteItem(db, id),
				);
				return mcpOk({ deleted: id }, commitHash);
			});
		},
	);

	// ── Attribute Types ───────────────────────────────────

	server.registerTool(
		"list_attribute_types",
		{
			description: "List all attribute types",
			inputSchema: {
				as_of: z
					.string()
					.optional()
					.describe("Commit hash or datetime for point-in-time read"),
			},
		},
		async ({ as_of }) => {
			return handleMcp(async () => {
				const result = await attributeTypes.listAttributeTypes(db, as_of);
				const version = await doltHead(db);
				return mcpOk(result, version);
			});
		},
	);

	server.registerTool(
		"create_attribute_type",
		{
			description: "Create a new attribute type",
			inputSchema: {
				name: z.string().describe("Type name (unique)"),
				version: z.string().optional().describe("Expected HEAD commit hash"),
			},
		},
		async ({ name, version }) => {
			return handleMcp(async () => {
				const head = await checkVersion(db, version);
				if (head) return mcpErr("CONFLICT", "Conflict", { head });
				const id = crypto.randomUUID();
				const { result, commitHash } = await withAutoCommit(
					db,
					`Create attribute type '${name}'`,
					() => attributeTypes.createAttributeType(db, id, name),
				);
				return mcpOk(result, commitHash);
			});
		},
	);

	server.registerTool(
		"delete_attribute_type",
		{
			description: "Delete an attribute type (fails if in use)",
			inputSchema: {
				id: z.string().describe("Attribute type ID"),
				version: z.string().optional().describe("Expected HEAD commit hash"),
			},
		},
		async ({ id, version }) => {
			return handleMcp(async () => {
				const head = await checkVersion(db, version);
				if (head) return mcpErr("CONFLICT", "Conflict", { head });
				const { commitHash } = await withAutoCommit(
					db,
					`Delete attribute type ${id}`,
					() => attributeTypes.deleteAttributeType(db, id),
				);
				return mcpOk({ deleted: id }, commitHash);
			});
		},
	);

	// ── Linkages ──────────────────────────────────────────

	server.registerTool(
		"list_linkages",
		{
			description: "List linkages with optional filters",
			inputSchema: {
				type_id: z.string().optional().describe("Linkage type ID"),
				source_id: z.string().optional().describe("Source item ID"),
				target_id: z.string().optional().describe("Target item ID"),
				limit: z.number().optional().describe("Max results"),
				offset: z.number().optional().describe("Skip N results"),
				as_of: z
					.string()
					.optional()
					.describe("Commit hash or datetime for point-in-time read"),
			},
		},
		async ({ type_id, source_id, target_id, limit, offset, as_of }) => {
			return handleMcp(async () => {
				const result = await linkages.listLinkages(db, {
					typeId: type_id,
					sourceId: source_id,
					targetId: target_id,
					limit,
					offset,
					asOf: as_of,
				});
				const version = await doltHead(db);
				return mcpOk(result, version);
			});
		},
	);

	server.registerTool(
		"create_linkages",
		{
			description: "Create one or more linkages between items",
			inputSchema: {
				linkages: z.array(
					z.object({
						source_id: z.string(),
						target_id: z.string(),
						type_id: z.string(),
					}),
				),
				version: z.string().optional().describe("Expected HEAD commit hash"),
			},
		},
		async ({ linkages: newLinkages, version }) => {
			return handleMcp(async () => {
				if (newLinkages.length === 0) {
					return mcpErr("BAD_REQUEST", "No linkages provided");
				}
				const head = await checkVersion(db, version);
				if (head) return mcpErr("CONFLICT", "Conflict", { head });
				const { result, commitHash } = await withAutoCommit(
					db,
					"Create linkages",
					async () => {
						const created = [];
						for (const linkage of newLinkages) {
							const id = crypto.randomUUID();
							created.push(
								await linkages.createLinkage(
									db,
									id,
									linkage.source_id,
									linkage.target_id,
									linkage.type_id,
								),
							);
						}
						return created;
					},
				);
				return mcpOk(result, commitHash);
			});
		},
	);

	server.registerTool(
		"remove_linkages",
		{
			description: "Remove one or more linkages by ID",
			inputSchema: {
				ids: z.array(z.string()),
				version: z.string().optional().describe("Expected HEAD commit hash"),
			},
		},
		async ({ ids, version }) => {
			return handleMcp(async () => {
				if (ids.length === 0) {
					return mcpErr("BAD_REQUEST", "No linkages provided");
				}
				const head = await checkVersion(db, version);
				if (head) return mcpErr("CONFLICT", "Conflict", { head });
				const { commitHash } = await withAutoCommit(
					db,
					"Remove linkages",
					async () => {
						for (const id of ids) {
							await linkages.deleteLinkage(db, id);
						}
					},
				);
				return mcpOk({ deleted: ids }, commitHash);
			});
		},
	);

	// ── Linkage Types ─────────────────────────────────────

	server.registerTool(
		"list_linkage_types",
		{
			description: "List all linkage types",
			inputSchema: {
				as_of: z
					.string()
					.optional()
					.describe("Commit hash or datetime for point-in-time read"),
			},
		},
		async ({ as_of }) => {
			return handleMcp(async () => {
				const result = await linkageTypes.listLinkageTypes(db, as_of);
				const version = await doltHead(db);
				return mcpOk(result, version);
			});
		},
	);

	server.registerTool(
		"create_linkage_type",
		{
			description: "Create a new linkage type",
			inputSchema: {
				name: z.string().describe("Type name (unique)"),
				version: z.string().optional().describe("Expected HEAD commit hash"),
			},
		},
		async ({ name, version }) => {
			return handleMcp(async () => {
				const head = await checkVersion(db, version);
				if (head) return mcpErr("CONFLICT", "Conflict", { head });
				const id = crypto.randomUUID();
				const { result, commitHash } = await withAutoCommit(
					db,
					`Create linkage type '${name}'`,
					() => linkageTypes.createLinkageType(db, id, name),
				);
				return mcpOk(result, commitHash);
			});
		},
	);

	server.registerTool(
		"delete_linkage_type",
		{
			description: "Delete a linkage type (fails if in use)",
			inputSchema: {
				id: z.string().describe("Linkage type ID"),
				version: z.string().optional().describe("Expected HEAD commit hash"),
			},
		},
		async ({ id, version }) => {
			return handleMcp(async () => {
				const head = await checkVersion(db, version);
				if (head) return mcpErr("CONFLICT", "Conflict", { head });
				const { commitHash } = await withAutoCommit(
					db,
					`Delete linkage type ${id}`,
					() => linkageTypes.deleteLinkageType(db, id),
				);
				return mcpOk({ deleted: id }, commitHash);
			});
		},
	);
}
