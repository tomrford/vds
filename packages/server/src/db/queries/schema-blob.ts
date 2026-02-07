import type { Kysely } from "kysely";
import { asOfTable } from "../../lib/dolt.ts";
import type { Database } from "../schema.ts";

const SCHEMA_BLOB_ID = "default";

export async function getSchemaBlob(db: Kysely<Database>, asOf?: string) {
	const row = await db
		.selectFrom(asOfTable("schema_blob", asOf))
		.selectAll()
		.where("id", "=", SCHEMA_BLOB_ID)
		.executeTakeFirst();
	return row ?? null;
}

export async function setSchemaBlob(db: Kysely<Database>, body: string) {
	await db
		.insertInto("schema_blob")
		.values({ id: SCHEMA_BLOB_ID, body })
		.onDuplicateKeyUpdate({ body })
		.execute();
	return getSchemaBlob(db);
}
