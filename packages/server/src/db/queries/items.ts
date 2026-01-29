import type { Kysely } from "kysely";
import { NotFoundError } from "../../lib/errors.ts";
import type { Database } from "../schema.ts";

export async function createItem(
	db: Kysely<Database>,
	id: string,
	body: string,
) {
	await db.insertInto("items").values({ id, body }).execute();
	return getItem(db, id);
}

export async function listItems(
	db: Kysely<Database>,
	opts?: {
		limit?: number;
		offset?: number;
		attrFilters?: { name: string; value: string }[];
	},
) {
	let q = db.selectFrom("items").selectAll("items").orderBy("created_at", "desc");

	for (const filter of opts?.attrFilters ?? []) {
		q = q.where((eb) =>
			eb.exists(
				eb
					.selectFrom("attributes")
					.innerJoin(
						"attribute_types",
						"attribute_types.id",
						"attributes.type_id",
					)
					.whereRef("attributes.item_id", "=", "items.id")
					.where("attribute_types.name", "=", filter.name)
					.where("attributes.value", "=", filter.value)
					.select(eb.lit(1).as("one")),
			),
		);
	}

	if (opts?.limit) q = q.limit(opts.limit);
	if (opts?.offset) q = q.offset(opts.offset);
	return q.execute();
}

export async function getItem(db: Kysely<Database>, id: string) {
	const row = await db
		.selectFrom("items")
		.selectAll()
		.where("id", "=", id)
		.executeTakeFirst();
	if (!row) throw new NotFoundError("item", id);
	return row;
}

export async function updateItem(
	db: Kysely<Database>,
	id: string,
	body: string,
) {
	const result = await db
		.updateTable("items")
		.set({ body })
		.where("id", "=", id)
		.executeTakeFirst();
	if (result.numUpdatedRows === 0n) throw new NotFoundError("item", id);
	return getItem(db, id);
}

export async function deleteItem(db: Kysely<Database>, id: string) {
	const result = await db
		.deleteFrom("items")
		.where("id", "=", id)
		.executeTakeFirst();
	if (result.numDeletedRows === 0n) throw new NotFoundError("item", id);
}
