import type { Kysely } from "kysely";
import { InUseError, NotFoundError } from "../../lib/errors.ts";
import type { Database } from "../schema.ts";

export async function createAttributeType(
	db: Kysely<Database>,
	id: string,
	name: string,
) {
	await db.insertInto("attribute_types").values({ id, name }).execute();
	return getAttributeType(db, id);
}

export async function listAttributeTypes(db: Kysely<Database>) {
	return db
		.selectFrom("attribute_types")
		.selectAll()
		.orderBy("name", "asc")
		.execute();
}

export async function getAttributeType(db: Kysely<Database>, id: string) {
	const row = await db
		.selectFrom("attribute_types")
		.selectAll()
		.where("id", "=", id)
		.executeTakeFirst();
	if (!row) throw new NotFoundError("attribute_type", id);
	return row;
}

export async function deleteAttributeType(db: Kysely<Database>, id: string) {
	// Check if in use
	const usage = await db
		.selectFrom("attributes")
		.select(db.fn.count("id").as("count"))
		.where("type_id", "=", id)
		.executeTakeFirstOrThrow();
	if (Number(usage.count) > 0) {
		throw new InUseError("attribute_type", id);
	}

	const result = await db
		.deleteFrom("attribute_types")
		.where("id", "=", id)
		.executeTakeFirst();
	if (result.numDeletedRows === 0n) throw new NotFoundError("attribute_type", id);
}
