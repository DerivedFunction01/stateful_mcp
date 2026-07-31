import type { ClinicalInitSeedRecord } from "../record";

export const records: ClinicalInitSeedRecord[] = [
	{ recordId: "starter.calendar-vocabulary", kind: "calendar_vocabulary", profileId: "starter.default", requires: ["starter.profile"], payload: { monthNames: {}, dayOfWeek: {}, dayPeriods: {} } },
	{ recordId: "starter.date-pattern", kind: "date_pattern", profileId: "starter.default", requires: ["starter.calendar-vocabulary"], payload: { tokens: ["YYYY", "MM", "DD"], separators: ["-", "-"] } },
	{ recordId: "starter.time-pattern", kind: "time_pattern", profileId: "starter.default", requires: ["starter.calendar-vocabulary"], payload: { tokens: ["HH", "minute"], separators: [":"] } },
	{ recordId: "starter.relative-time", kind: "relative_time_rule", profileId: "starter.default", requires: ["starter.profile"], payload: { sequences: [], precisionUnits: {}, directionAnchors: {} } },
	{ recordId: "starter.range", kind: "range_rule", profileId: "starter.default", requires: ["starter.date-pattern"], payload: { sequences: [], startTarget: "startDatetime", endTarget: "endDatetime" } },
	{ recordId: "starter.cadence", kind: "cadence_rule", profileId: "starter.default", requires: ["starter.profile"], payload: { mappings: [] } },
	{ recordId: "starter.exclusion", kind: "exclusion_rule", profileId: "starter.default", requires: ["starter.cadence"], payload: { sequences: [], target: "excludedDatetimes" } },
];