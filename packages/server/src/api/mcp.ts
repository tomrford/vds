import { StreamableHTTPTransport } from "@hono/mcp";
import type { Context } from "hono";
import { Hono } from "hono";
import { createMcpServer } from "../mcp/server.ts";
import type { Env } from "./app.ts";

export const mcpRoutes = new Hono<Env>();

let transport: StreamableHTTPTransport | null = null;
let server = null as ReturnType<typeof createMcpServer> | null;

async function getTransport(c: Context<Env>) {
	if (!transport) {
		transport = new StreamableHTTPTransport();
	}
	if (!server) {
		server = createMcpServer(c.get("db"));
	}
	if (!server.isConnected()) {
		await server.connect(transport);
	}
	return transport;
}

mcpRoutes.all("/", async (c) => {
	const mcpTransport = await getTransport(c);
	return mcpTransport.handleRequest(c);
});
