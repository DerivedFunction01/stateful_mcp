import type { SimpleEntityConfig } from "./entity-config";

export interface VariableRecord {
	var_key: string;
	value: unknown;
	blockInstanceId?: string;
	createdAt?: string;
}

export interface PersistedVariableRecord extends VariableRecord {
	tags: string[];
	description: string;
}

export const variableSimpleEntityConfig: SimpleEntityConfig<
	VariableRecord,
	PersistedVariableRecord
> = {
	idPrefix: "var_",
	idField: "var_key",
	tagsField: "tags",
	timestampField: "createdAt",
	parseTimestamp: (v: any) => new Date(v).getTime(),
};
