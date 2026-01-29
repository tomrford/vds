import type { Kysely } from "kysely";
import { asOfTable } from "../../lib/dolt.ts";
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
		asOf?: string;
	},
) {
	const itemsTable = asOfTable("items", opts?.asOf);
	let q = db
		.selectFrom(itemsTable)
		.selectAll("items")
		.orderBy("created_at", "desc");

	for (const filter of opts?.attrFilters ?? []) {
		const attributesTable = asOfTable("attributes", opts?.asOf);
		const attributeTypesTable = asOfTable("attribute_types", opts?.asOf);
		q = q.where((eb) =>
			eb.exists(
				eb
					.selectFrom(attributesTable)
					.innerJoin(
						attributeTypesTable,
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
	const rows = await q.execute();
	const itemIds = rows.map((row) => row.id);
	let attrs: {
		id: string;
		item_id: string;
		type_id: string;
		value: string;
		created_at: Date;
	}[] = [];
	if (itemIds.length > 0) {
		const attributesTable = asOfTable("attributes", opts?.asOf);
		attrs = await db
			.selectFrom(attributesTable)
			.selectAll()
			.where("item_id", "in", itemIds)
			.orderBy("created_at", "asc")
			.execute();
	}

	const attrsByItem = new Map<string, (typeof attrs)[number][]>();
	for (const attr of attrs) {
		const list = attrsByItem.get(attr.item_id) ?? [];
		list.push(attr);
		attrsByItem.set(attr.item_id, list);
	}

	return rows.map((row) => ({
		...row,
		attributes: attrsByItem.get(row.id) ?? [],
	}));
}

export async function getItem(db: Kysely<Database>, id: string, asOf?: string) {
	const row = await db
		.selectFrom(asOfTable("items", asOf))
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
