import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Kysely } from "kysely";
import { z } from "zod";
import * as items from "../db/queries/items.ts";
import * as attributes from "../db/queries/attributes.ts";
import * as attributeTypes from "../db/queries/attribute-types.ts";
import * as linkages from "../db/queries/linkages.ts";
import * as linkageTypes from "../db/queries/linkage-types.ts";
import {
	withAutoCommit,
	doltLog,
	doltCommitDetails,
	doltItemHistory,
} from "../lib/dolt.ts";
import type { Database } from "../db/schema.ts";

function text(data: unknown) {
	return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
}

export function registerTools(server: McpServer, db: Kysely<Database>) {
	// ── Items ──────────────────────────────────────────────

	server.registerTool("create_item", {
		description: "Create a new item",
		inputSchema: { body: z.string().describe("Item body text") },
	}, async ({ body }) => {
		const id = crypto.randomUUID();
		const { result } = await withAutoCommit(db, `Create item ${id}`, () =>
			items.createItem(db, id, body),
		);
		return text(result);
	});

	server.registerTool("list_items", {
		description: "List items with optional pagination and attribute filters",
		inputSchema: {
			limit: z.number().optional().describe("Max results"),
			offset: z.number().optional().describe("Skip N results"),
			filters: z.record(z.string(), z.string()).optional().describe("Attribute filters as { typeName: value }"),
		},
	}, async ({ limit, offset, filters }) => {
		let result = await items.listItems(db, { limit, offset });

		if (filters && Object.keys(filters).length > 0) {
			const types = await attributeTypes.listAttributeTypes(db);
			const typeNameToId = new Map(types.map((t) => [t.name, t.id]));
			const allAttrs = await Promise.all(
				result.map((item) => attributes.listAttributes(db, item.id)),
			);
			result = result.filter((_item, i) => {
				const itemAttrs = allAttrs[i] ?? [];
				return Object.entries(filters).every(([name, value]) => {
					const typeId = typeNameToId.get(name);
					if (!typeId) return false;
					return itemAttrs.some((a) => a.type_id === typeId && a.value === value);
				});
			});
		}

		return text(result);
	});

	server.registerTool("get_item", {
		description: "Get an item by ID, optionally including attributes and linkages",
		inputSchema: {
			id: z.string().describe("Item ID"),
			include: z.array(z.enum(["attributes", "linkages"])).optional()
				.describe("Related data to include"),
		},
	}, async ({ id, include }) => {
		const item = await items.getItem(db, id);
		const response: Record<string, unknown> = { ...item };
		if (include?.includes("attributes")) {
			response.attributes = await attributes.listAttributes(db, id);
		}
		if (include?.includes("linkages")) {
			response.linkages = await linkages.listLinkages(db, id);
		}
		return text(response);
	});

	server.registerTool("update_item", {
		description: "Update an item's body text",
		inputSchema: {
			id: z.string().describe("Item ID"),
			body: z.string().describe("New body text"),
		},
	}, async ({ id, body }) => {
		const { result } = await withAutoCommit(db, `Update item ${id}`, () =>
			items.updateItem(db, id, body),
		);
		return text(result);
	});

	server.registerTool("delete_item", {
		description: "Delete an item and its attributes/linkages",
		inputSchema: { id: z.string().describe("Item ID") },
	}, async ({ id }) => {
		await withAutoCommit(db, `Delete item ${id}`, () =>
			items.deleteItem(db, id),
		);
		return text({ deleted: id });
	});

	// ── Attributes ────────────────────────────────────────

	server.registerTool("list_attributes", {
		description: "List attributes for an item",
		inputSchema: { item_id: z.string().describe("Item ID") },
	}, async ({ item_id }) => {
		return text(await attributes.listAttributes(db, item_id));
	});

	server.registerTool("add_attribute", {
		description: "Add an attribute to an item",
		inputSchema: {
			item_id: z.string().describe("Item ID"),
			type_id: z.string().describe("Attribute type ID"),
			value: z.string().describe("Attribute value"),
		},
	}, async ({ item_id, type_id, value }) => {
		const id = crypto.randomUUID();
		const { result } = await withAutoCommit(
			db,
			`Add attribute to item ${item_id}`,
			() => attributes.addAttribute(db, id, item_id, type_id, value),
		);
		return text(result);
	});

	server.registerTool("update_attribute", {
		description: "Update an attribute's value",
		inputSchema: {
			id: z.string().describe("Attribute ID"),
			value: z.string().describe("New value"),
		},
	}, async ({ id, value }) => {
		const { result } = await withAutoCommit(
			db,
			`Update attribute ${id}`,
			() => attributes.updateAttribute(db, id, value),
		);
		return text(result);
	});

	server.registerTool("remove_attribute", {
		description: "Remove an attribute",
		inputSchema: { id: z.string().describe("Attribute ID") },
	}, async ({ id }) => {
		await withAutoCommit(db, `Remove attribute ${id}`, () =>
			attributes.deleteAttribute(db, id),
		);
		return text({ deleted: id });
	});

	// ── Attribute Types ───────────────────────────────────

	server.registerTool("list_attribute_types", {
		description: "List all attribute types",
		inputSchema: {},
	}, async () => {
		return text(await attributeTypes.listAttributeTypes(db));
	});

	server.registerTool("create_attribute_type", {
		description: "Create a new attribute type",
		inputSchema: { name: z.string().describe("Type name (unique)") },
	}, async ({ name }) => {
		const id = crypto.randomUUID();
		const { result } = await withAutoCommit(
			db,
			`Create attribute type '${name}'`,
			() => attributeTypes.createAttributeType(db, id, name),
		);
		return text(result);
	});

	server.registerTool("delete_attribute_type", {
		description: "Delete an attribute type (fails if in use)",
		inputSchema: { id: z.string().describe("Attribute type ID") },
	}, async ({ id }) => {
		await withAutoCommit(db, `Delete attribute type ${id}`, () =>
			attributeTypes.deleteAttributeType(db, id),
		);
		return text({ deleted: id });
	});

	// ── Linkages ──────────────────────────────────────────

	server.registerTool("list_linkages", {
		description: "List linkages for an item",
		inputSchema: {
			item_id: z.string().describe("Item ID"),
			direction: z.enum(["source", "target", "both"]).optional()
				.describe("Filter by direction (default: both)"),
		},
	}, async ({ item_id, direction }) => {
		return text(await linkages.listLinkages(db, item_id, direction));
	});

	server.registerTool("create_linkage", {
		description: "Create a linkage between two items",
		inputSchema: {
			source_id: z.string().describe("Source item ID"),
			target_id: z.string().describe("Target item ID"),
			type_id: z.string().describe("Linkage type ID"),
		},
	}, async ({ source_id, target_id, type_id }) => {
		const id = crypto.randomUUID();
		const { result } = await withAutoCommit(
			db,
			`Link ${source_id} -> ${target_id}`,
			() => linkages.createLinkage(db, id, source_id, target_id, type_id),
		);
		return text(result);
	});

	server.registerTool("remove_linkage", {
		description: "Remove a linkage",
		inputSchema: { id: z.string().describe("Linkage ID") },
	}, async ({ id }) => {
		await withAutoCommit(db, `Remove linkage ${id}`, () =>
			linkages.deleteLinkage(db, id),
		);
		return text({ deleted: id });
	});

	// ── Linkage Types ─────────────────────────────────────

	server.registerTool("list_linkage_types", {
		description: "List all linkage types",
		inputSchema: {},
	}, async () => {
		return text(await linkageTypes.listLinkageTypes(db));
	});

	server.registerTool("create_linkage_type", {
		description: "Create a new linkage type",
		inputSchema: { name: z.string().describe("Type name (unique)") },
	}, async ({ name }) => {
		const id = crypto.randomUUID();
		const { result } = await withAutoCommit(
			db,
			`Create linkage type '${name}'`,
			() => linkageTypes.createLinkageType(db, id, name),
		);
		return text(result);
	});

	server.registerTool("delete_linkage_type", {
		description: "Delete a linkage type (fails if in use)",
		inputSchema: { id: z.string().describe("Linkage type ID") },
	}, async ({ id }) => {
		await withAutoCommit(db, `Delete linkage type ${id}`, () =>
			linkageTypes.deleteLinkageType(db, id),
		);
		return text({ deleted: id });
	});

	// ── History ───────────────────────────────────────────

	server.registerTool("list_commits", {
		description: "List Dolt commits (most recent first)",
		inputSchema: {
			limit: z.number().optional().describe("Max results (default 50)"),
			offset: z.number().optional().describe("Skip N results"),
		},
	}, async ({ limit, offset }) => {
		return text(await doltLog(db, { limit, offset }));
	});

	server.registerTool("get_commit", {
		description: "Get details of a specific commit by hash",
		inputSchema: { hash: z.string().describe("Commit hash") },
	}, async ({ hash }) => {
		return text(await doltCommitDetails(db, hash));
	});

	server.registerTool("get_item_history", {
		description: "Get commits that changed a specific item",
		inputSchema: {
			item_id: z.string().describe("Item ID"),
			limit: z.number().optional().describe("Max results (default 50)"),
			offset: z.number().optional().describe("Skip N results"),
		},
	}, async ({ item_id, limit, offset }) => {
		return text(await doltItemHistory(db, item_id, { limit, offset }));
	});
}
