import type { FormState } from "../../../middleware/form/types";
import type { PersistedFormStateDetails } from "../interfaces";
import type { SimpleEntityConfig } from "./entity-config";

export const formSimpleEntityConfig: SimpleEntityConfig<
	FormState,
	PersistedFormStateDetails
> = {
	idPrefix: "form_",
	idField: "formId",
	parentIdField: "parentFormId",
	tagsField: "tags",
	timestampField: "timestamp",
	parseTimestamp: (v: any) => new Date(v).getTime(),
};
