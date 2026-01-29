import type { Kysely } from "kysely";
import { asOfTable } from "../../lib/dolt.ts";
import { NotFoundError } from "../../lib/errors.ts";
import type { Database } from "../schema.ts";

export async function createLinkage(
	db: Kysely<Database>,
	id: string,
	sourceId: string,
	targetId: string,
	typeId: string,
) {
	await db
		.insertInto("linkages")
		.values({ id, source_id: sourceId, target_id: targetId, type_id: typeId })
		.execute();
	return getLinkage(db, id);
}

export async function listLinkagesForItem(
	db: Kysely<Database>,
	itemId: string,
	direction?: "source" | "target" | "both",
	asOf?: string,
) {
	const dir = direction ?? "both";
	let q = db.selectFrom(asOfTable("linkages", asOf)).selectAll();

	if (dir === "source") {
		q = q.where("source_id", "=", itemId);
	} else if (dir === "target") {
		q = q.where("target_id", "=", itemId);
	} else {
		q = q.where((eb) =>
			eb.or([eb("source_id", "=", itemId), eb("target_id", "=", itemId)]),
		);
	}

	return q.orderBy("created_at", "asc").execute();
}

export async function listLinkages(
	db: Kysely<Database>,
	opts?: {
		typeId?: string;
		sourceId?: string;
		targetId?: string;
		limit?: number;
		offset?: number;
		asOf?: string;
	},
) {
	let q = db.selectFrom(asOfTable("linkages", opts?.asOf)).selectAll();

	if (opts?.typeId) q = q.where("type_id", "=", opts.typeId);
	if (opts?.sourceId) q = q.where("source_id", "=", opts.sourceId);
	if (opts?.targetId) q = q.where("target_id", "=", opts.targetId);
	if (opts?.limit) q = q.limit(opts.limit);
	if (opts?.offset) q = q.offset(opts.offset);

	return q.orderBy("created_at", "asc").execute();
}

export async function getLinkage(db: Kysely<Database>, id: string) {
	const row = await db
		.selectFrom("linkages")
		.selectAll()
		.where("id", "=", id)
		.executeTakeFirst();
	if (!row) throw new NotFoundError("linkage", id);
	return row;
}

export async function deleteLinkage(db: Kysely<Database>, id: string) {
	const result = await db
		.deleteFrom("linkages")
		.where("id", "=", id)
		.executeTakeFirst();
	if (result.numDeletedRows === 0n) throw new NotFoundError("linkage", id);
}
