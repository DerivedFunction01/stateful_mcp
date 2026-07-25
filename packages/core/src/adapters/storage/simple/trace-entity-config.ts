import type { TraceForm } from "../../../middleware/trace/types";
import type { PersistedTraceState } from "../interfaces";
import type { SimpleEntityConfig } from "./entity-config";

export const traceSimpleEntityConfig: SimpleEntityConfig<
	TraceForm,
	PersistedTraceState
> = {
	idPrefix: "trc_",
	idField: "trace_id",
	tagsField: "tags",
	timestampField: "createdAt",
	parseTimestamp: (v: any) => new Date(v).getTime(),
};
