import { Kysely, MysqlDialect } from "kysely";
import { createPool } from "mysql2";
import type { Database } from "./schema.ts";

export function createDb(opts?: {
	host?: string;
	port?: number;
	user?: string;
	password?: string;
	database?: string;
}): Kysely<Database> {
	const hasDatabase = opts && "database" in opts;
	const pool = createPool({
		host: opts?.host ?? process.env.DOLT_HOST ?? "localhost",
		port: opts?.port ?? Number(process.env.DOLT_PORT ?? 3306),
		user: opts?.user ?? process.env.DOLT_USER ?? "root",
		password: opts?.password ?? process.env.DOLT_PASSWORD ?? "",
		...(hasDatabase
			? { database: opts.database }
			: { database: process.env.DOLT_DATABASE ?? "vds" }),
	});

	return new Kysely<Database>({
		// biome-ignore lint/suspicious/noExplicitAny: mysql2 v3 Pool type diverges from Kysely's MysqlPool
		dialect: new MysqlDialect({ pool: pool as any }),
	});
}
