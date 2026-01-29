import type { Kysely } from "kysely";
import { InUseError, NotFoundError } from "../../lib/errors.ts";
import type { Database } from "../schema.ts";

export async function createLinkageType(
	db: Kysely<Database>,
	id: string,
	name: string,
) {
	await db.insertInto("linkage_types").values({ id, name }).execute();
	return getLinkageType(db, id);
}

export async function listLinkageTypes(db: Kysely<Database>) {
	return db
		.selectFrom("linkage_types")
		.selectAll()
		.orderBy("name", "asc")
		.execute();
}

export async function getLinkageType(db: Kysely<Database>, id: string) {
	const row = await db
		.selectFrom("linkage_types")
		.selectAll()
		.where("id", "=", id)
		.executeTakeFirst();
	if (!row) throw new NotFoundError("linkage_type", id);
	return row;
}

export async function deleteLinkageType(db: Kysely<Database>, id: string) {
	const usage = await db
		.selectFrom("linkages")
		.select(db.fn.count("id").as("count"))
		.where("type_id", "=", id)
		.executeTakeFirstOrThrow();
	if (Number(usage.count) > 0) {
		throw new InUseError("linkage_type", id);
	}

	const result = await db
		.deleteFrom("linkage_types")
		.where("id", "=", id)
		.executeTakeFirst();
	if (result.numDeletedRows === 0n) throw new NotFoundError("linkage_type", id);
}
