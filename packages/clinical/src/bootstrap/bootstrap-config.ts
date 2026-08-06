import type { FrequencyProfile } from "../values/frequency-resolver";
import type { NumericalSyntaxProfile } from "../values/numerical-syntax-profile";

export const bootstrapNumericalDefaults: NumericalSyntaxProfile = {
	profileId: "v2-numerical-default",
	temporal: {
		dateTimeFormats: [
			// ISO date-only: YYYY-MM-DD  →  precision day (explicit)
			{
				tokens: ["YYYY", "MM", "DD"],
				separators: ["-", "-"],
				options: { exact: true, precision: "day" },
			},
			// ISO date-time with timezone: YYYY-MM-DDTHH:mm:SS tz  →  precision second (inferred)
			{
				tokens: ["YYYY", "MM", "DD", "HH", "min", "SS", "tz"],
				separators: ["-", "-", "T", ":", ":", " "],
				options: { exact: true, is24Hour: true },
			},
			// ISO date-time without timezone: YYYY-MM-DDTHH:mm:SS  →  precision second (inferred)
			{
				tokens: ["YYYY", "MM", "DD", "HH", "min", "SS"],
				separators: ["-", "-", "T", ":", ":"],
				options: { exact: true, is24Hour: true },
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
	},
	numberWords: null,
	unitDisplay: {},
};

export const bootstrapFrequencyDefaults: FrequencyProfile = {
	aliases: {
		QD: { multiplier: 1, unit: "day" },
		BID: { multiplier: 12, unit: "hour" },
		TID: { multiplier: 8, unit: "hour" },
		QID: { multiplier: 6, unit: "hour" },
	},
};

import type { CommandSyntaxProfileDefaults } from "../commands/command-syntax-profile";

export const bootstrapCommandDefaults: CommandSyntaxProfileDefaults = {
	directCommandToken: ":",
	macroStartToken: "^",
	directCommandMappings: {
		branch: ["branch", "b"],
		confirm: ["confirm", "dx"],
		rule_out: ["rule_out", "r/o", "rule-out", "ruleout"],
		suspend: ["suspend", "susp"],
		re_activate: ["re_activate", "reactivate"],
		close: ["close"],
		complete: ["complete"],
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
	expressionToken: "#",
	conceptToken: "",
};
