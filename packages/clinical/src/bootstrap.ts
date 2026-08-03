import type { TemporalDirection, TimePrecisionLevel } from "./schemas/schemas-interface/time";
import type { FrequencyProfile } from "./values/frequency-resolver";
import type { CommandSyntaxProfile } from "./commands/command-syntax-profile";
import type { TemporalSyntaxProfile } from "./values/temporal-syntax-profile";

/**
 * Bootstrap fixture — DO NOT import this file in runtime code.
 *
 * This file exists solely as a seed/fixture for initialisation and testing.
 * All defaults listed here are hardcoded starting points; in a real deployment
 * they should be supplied by the user via profile configuration, not baked into
 * runtime packages. The `bootstrap/` directory (cold-start.ts, mock-patient.ts)
 * remains a fixture only and must not be treated as production runtime code.
 */

export const _TEMPORAL_SYNTAX_DEFAULTS: TemporalSyntaxProfile = {
	profileId: "v2-temporal-default",
	dateRecognitionRules: [
		{
			pattern:
				"^(?<year>\\d{4})-(?<month>\\d{2})-(?<day>\\d{2})(?:T(?<time>[^\\s]+))?$",
			precision: "day",
			yearGroup: "year",
			monthGroup: "month",
			dayGroup: "day",
			timeGroup: "time",
		},
	],
	relativeDayAliases: { today: 0, yesterday: -1, tomorrow: 1 },
	unitAliases: {
		second: "second",
		seconds: "second",
		minute: "minute",
		minutes: "minute",
		hour: "hour",
		hours: "hour",
		day: "day",
		days: "day",
		week: "week",
		weeks: "week",
		month: "month",
		months: "month",
		year: "year",
		years: "year",
	},
	directionAliases: {
		ago: "retrospective",
		before: "retrospective",
		after: "prospective",
		in: "prospective",
	},
	rangeDelimiters: ["..", " to "],
	boundaryAliases: {
		start: "start",
		beginning: "start",
		end: "end",
		until: "end",
		include: "include",
		exclude: "exclude",
	},
};

export const _FREQUENCY_DEFAULTS: FrequencyProfile = {
	aliases: {
		QD: { multiplier: 1, unit: "day" },
		BID: { multiplier: 12, unit: "hour" },
		TID: { multiplier: 8, unit: "hour" },
		QID: { multiplier: 6, unit: "hour" },
	},
};

export const _SYNTAX_DEFAULTS = {
	macroStartToken: "^",
	variableStartToken: "{",
	variableEndToken: "}",
	directCommandToken: ":",
	conceptCodeSeparator: "::",
	macroArgDelimiter: undefined,
	fallbackBoundaryDelimiter: undefined,
} as const;

export const _COMMAND_SYNTAX_DEFAULTS = {
	directCommandToken: ":",
	macroStartToken: "^",
	directCommandMappings: {
		branch: "branch",
		confirm: "confirm",
		rule_out: "rule_out",
		suspend: "suspend",
		re_activate: "re_activate",
		close: "close",
		complete: "complete",
	},
	editorCommandMappings: {
		write: "write",
		w: "write",
		quit: "quit",
		q: "quit",
		write_quit: "write_quit",
		wq: "write_quit",
		help: "help",
		h: "help",
		mode: "mode",
		undo: "undo",
		u: "undo",
		redo: "redo",
		render: "render",
	},
	variableCommandToken: ":",
	variableCommandName: "var",
	variableAssignmentDelimiter: "=",
	variableNamePattern: "^[A-Za-z_][A-Za-z0-9_.]*$",
	variableCommandMappings: {
		set: "set",
		update: "update",
		eval: "eval",
		assert: "assert",
		remove: "remove",
	},
} as const;