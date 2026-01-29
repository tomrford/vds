import type { Kysely } from "kysely";
import { sql } from "kysely";
import type { Database } from "./schema.ts";

/** Create all tables if they don't exist. */
export async function migrate(db: Kysely<Database>): Promise<void> {
	await sql`
		CREATE TABLE IF NOT EXISTS items (
			id          VARCHAR(36) PRIMARY KEY,
			body        TEXT NOT NULL,
			created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)
	`.execute(db);

	await sql`
		CREATE TABLE IF NOT EXISTS attribute_types (
			id          VARCHAR(36) PRIMARY KEY,
			name        VARCHAR(255) NOT NULL UNIQUE,
			created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)
	`.execute(db);

	await sql`
		CREATE TABLE IF NOT EXISTS linkage_types (
			id          VARCHAR(36) PRIMARY KEY,
			name        VARCHAR(255) NOT NULL UNIQUE,
			created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)
	`.execute(db);

	await sql`
		CREATE TABLE IF NOT EXISTS attributes (
			id          VARCHAR(36) PRIMARY KEY,
			item_id     VARCHAR(36) NOT NULL,
			type_id     VARCHAR(36) NOT NULL,
			value       TEXT NOT NULL,
			created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			UNIQUE(item_id, type_id),
			FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
			FOREIGN KEY (type_id) REFERENCES attribute_types(id) ON DELETE RESTRICT
		)
	`.execute(db);

	await sql`
		CREATE TABLE IF NOT EXISTS linkages (
			id          VARCHAR(36) PRIMARY KEY,
			source_id   VARCHAR(36) NOT NULL,
			target_id   VARCHAR(36) NOT NULL,
			type_id     VARCHAR(36) NOT NULL,
			created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			UNIQUE(source_id, target_id, type_id),
			FOREIGN KEY (source_id) REFERENCES items(id) ON DELETE CASCADE,
			FOREIGN KEY (target_id) REFERENCES items(id) ON DELETE CASCADE,
			FOREIGN KEY (type_id) REFERENCES linkage_types(id) ON DELETE RESTRICT
		)
	`.execute(db);
}
