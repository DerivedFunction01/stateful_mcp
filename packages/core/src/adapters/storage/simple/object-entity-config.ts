import type { ObjectState } from "../../../middleware/object/types";
import type { PersistedObjectState } from "../interfaces";
import type { SimpleEntityConfig } from "./entity-config";

export const objectSimpleEntityConfig: SimpleEntityConfig<
	ObjectState,
	PersistedObjectState
> = {
	idPrefix: "obj_",
	idField: "objectId",
	parentIdField: "parentObjectId",
	tagsField: "tags",
	timestampField: "createdAt",
	parseTimestamp: (v: any) => new Date(v).getTime(),
};
