import type { EventCommit } from "../../../middleware/event/types";
import type { PersistedEventState } from "../interfaces";
import type { SimpleEntityConfig } from "./entity-config";

export const eventSimpleEntityConfig: SimpleEntityConfig<
	EventCommit,
	PersistedEventState
> = {
	idPrefix: "commit_",
	idField: "commitId",
	parentIdField: "parentCommitId",
	tagsField: "tags",
	timestampField: "createdAt",
	parseTimestamp: (v: any) => new Date(v).getTime(),
};
