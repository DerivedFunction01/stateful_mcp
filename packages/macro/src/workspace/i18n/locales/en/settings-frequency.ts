export const EN_SETTINGS_FREQUENCY = {
	"settings.schema.values.frequency.templates.title":
		"Cadence Format Templates",
	"settings.schema.values.frequency.templates.desc":
		"Ordered format templates using tokens (INTERVAL_MAG, INTERVAL_UNIT, RECURRENCE_COUNT, etc.).",
	"settings.schema.values.frequency.intervalPrefixes.title":
		"Interval Prefixes",
	"settings.schema.values.frequency.intervalPrefixes.desc":
		"Prefix tokens initiating an interval cadence (split by || in settings form).",
	"settings.schema.values.frequency.recurrenceConnectors.title":
		"Recurrence Connectors",
	"settings.schema.values.frequency.recurrenceConnectors.desc":
		"Connector tokens linking count to period (e.g. 'times a', 'x/', 'per').",
	"settings.schema.values.frequency.conditionalAliases.title":
		"PRN & Conditional Triggers",
	"settings.schema.values.frequency.conditionalAliases.desc":
		"As-needed or on-demand trigger words (e.g. 'prn', 'as needed').",
	"settings.schema.values.frequency.conditionConnectors.title":
		"Condition Connectors",
	"settings.schema.values.frequency.conditionConnectors.desc":
		"Words introducing the conditional reason (e.g. 'for', 'due to', 'on', 'with').",
	"settings.schema.values.frequency.rangeDelimiters.title":
		"Frequency Range Delimiters",
	"settings.schema.values.frequency.rangeDelimiters.desc":
		"Characters or words separating frequency range bounds (e.g. '-', 'to', 'until').",
} as const;
