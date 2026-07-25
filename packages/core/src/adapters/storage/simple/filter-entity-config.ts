import type { FilterState } from "../../../middleware/filter/types";
import type { PersistedFilterState } from "../interfaces";
import type { SimpleEntityConfig } from "./entity-config";

export const filterSimpleEntityConfig: SimpleEntityConfig<
	FilterState,
	PersistedFilterState
> = {
	idPrefix: "filter_",
	idField: "filterId",
	parentIdField: "parentFilterId",
	tagsField: "tags",
	timestampField: "createdAt",
	parseTimestamp: (v: any) => new Date(v).getTime(),
};
