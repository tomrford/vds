import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { Kysely } from "kysely";
import type { Database } from "../db/schema.ts";
import { registerTools } from "./tools.ts";

/** Create an MCP server with all VDS tools registered. */
export function createMcpServer(db: Kysely<Database>): McpServer {
	const server = new McpServer({
		name: "vds",
		version: "0.0.1",
	});

	registerTools(server, db);
	return server;
}

/** Start the MCP server on stdio transport. */
export async function startMcpServer(db: Kysely<Database>): Promise<void> {
	const server = createMcpServer(db);
	const transport = new StdioServerTransport();
	await server.connect(transport);
}
