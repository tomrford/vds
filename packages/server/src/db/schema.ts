import type { Generated } from "kysely";

export interface ItemsTable {
	id: string;
	body: string;
	created_at: Generated<Date>;
}

export interface AttributeTypesTable {
	id: string;
	name: string;
	created_at: Generated<Date>;
}

export interface LinkageTypesTable {
	id: string;
	name: string;
	created_at: Generated<Date>;
}

export interface AttributesTable {
	id: string;
	item_id: string;
	type_id: string;
	value: string;
	created_at: Generated<Date>;
}

export interface LinkagesTable {
	id: string;
	source_id: string;
	target_id: string;
	type_id: string;
	created_at: Generated<Date>;
}

export interface SchemaBlobTable {
	id: string;
	body: string;
	created_at: Generated<Date>;
}

export interface Database {
	items: ItemsTable;
	attribute_types: AttributeTypesTable;
	linkage_types: LinkageTypesTable;
	attributes: AttributesTable;
	linkages: LinkagesTable;
	schema_blob: SchemaBlobTable;
}
