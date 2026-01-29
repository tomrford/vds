import type { Kysely } from "kysely";
import { NotFoundError } from "../../lib/errors.ts";
import type { Database } from "../schema.ts";

export async function addAttribute(
	db: Kysely<Database>,
	id: string,
	itemId: string,
	typeId: string,
	value: string,
) {
	await db
		.insertInto("attributes")
		.values({ id, item_id: itemId, type_id: typeId, value })
		.execute();
	return getAttribute(db, id);
}

export async function listAttributes(db: Kysely<Database>, itemId: string) {
	return db
		.selectFrom("attributes")
		.selectAll()
		.where("item_id", "=", itemId)
		.orderBy("created_at", "asc")
		.execute();
}

export async function getAttribute(db: Kysely<Database>, id: string) {
	const row = await db
		.selectFrom("attributes")
		.selectAll()
		.where("id", "=", id)
		.executeTakeFirst();
	if (!row) throw new NotFoundError("attribute", id);
	return row;
}

export async function updateAttribute(
	db: Kysely<Database>,
	id: string,
	value: string,
) {
	const result = await db
		.updateTable("attributes")
		.set({ value })
		.where("id", "=", id)
		.executeTakeFirst();
	if (result.numUpdatedRows === 0n) throw new NotFoundError("attribute", id);
	return getAttribute(db, id);
}

export async function deleteAttribute(db: Kysely<Database>, id: string) {
	const result = await db
		.deleteFrom("attributes")
		.where("id", "=", id)
		.executeTakeFirst();
	if (result.numDeletedRows === 0n) throw new NotFoundError("attribute", id);
}
