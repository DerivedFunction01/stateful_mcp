import type { TableSchema } from "../../config/types";

export interface FilterCondition {
	property: string;
	operator:
		| "eq"
		| "neq"
		| "gt"
		| "geq"
		| "lt"
		| "leq"
		| "like"
		| "not_like"
		| "starts_with"
		| "ends_with"
		| "str_contains"
		| "in_set"
		| "not_in_set"
		| "between"
		| "not_between";
	value: any;
}

export interface Aggregation {
	function:
		| "count"
		| "count_distinct"
		| "sum"
		| "avg"
		| "min"
		| "max"
		| "std_dev"
		| "median"
		| "q1"
		| "q3"
		| "range"
		| "stat";
	property: string;
	alias: string;
}

export interface SortInstruction {
	property: string;
	direction: "asc" | "desc";
}

export interface QueryDefinition {
	table?: string;
	sourceViewId?: string;
	filters?: FilterCondition[];
	projections?: string[];
	group_by?: string[];
	aggregations?: Aggregation[];
	sort?: SortInstruction[];
	limit?: number;
	offset?: number;
	union?: QueryDefinition;
	intersect?: QueryDefinition;
	except?: QueryDefinition;
}

export interface FilterState {
	filterId: string;
	toolName?: string;
	tableName?: string;
	rules: FilterCondition[];
	parentFilterId?: string | null;
	createdAt: string;

	// Combined node metadata
	combined_operation?:
		| "union"
		| "intersection"
		| "difference"
		| "symmetric_difference"
		| null;
	combined_ids?: string[] | null;

	// Snapshot of public TableSchema pinned at init() time
	schema_snapshot?: TableSchema | null;

	// Auto-compression & GC fields
	linearDepth?: number;
	gcLock?: boolean;
}

export interface ModifierState {
	modId: string;
	filterId?: string | null;
	columns: string[];
	aggregations: Aggregation[];
	createdAt: string;
}

export interface ViewState {
	viewId: string;
	filterId: string;
	modId?: string | null;
	havingId?: string | null;
	limit?: number;
	offset?: number;
	createdAt: string;
}

export interface SavedView {
	id: string; // filterId or viewId
	tags: string[];
	description: string;
	savedAt: string;
}
