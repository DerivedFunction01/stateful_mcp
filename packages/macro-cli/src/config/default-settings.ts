import type { I18nKernel, SettingsSchemaEntry } from "@stateful-mcp/macro";
import { translate } from "../locales";
import { THEME_IDS } from "../ui/theme";

export const DEFAULT_WORKSPACE_SETTINGS_VALUES = {
	syntax: {
		macroStartToken: "@",
		conceptToken: "#",
		delimiter: "=",
	},
	values: {
		decimalSeparator: ".",
		dateTimeFormat: "[YYYY[-MM[-DD]]][ HH:min[:SS]]",
	},
	appearance: {
		theme: "github-dark",
	},
	editor: {
		keymap: "default",
	},
	locale: "en",
} as const;

export function getDefaultSettingsSchema(
	i18n?: I18nKernel,
): readonly SettingsSchemaEntry[] {
	return [
		{
			path: ["syntax", "macroStartToken"],
			type: "string",
			title: translate(
				i18n,
				"settings.schema.syntax.macroStartToken.title",
				"Expression Trigger Token",
			),
			description: translate(
				i18n,
				"settings.schema.syntax.macroStartToken.desc",
				"Symbol used to initiate macro and expression invocations.",
			),
		},
		{
			path: ["syntax", "conceptToken"],
			type: "string",
			title: translate(
				i18n,
				"settings.schema.syntax.conceptToken.title",
				"Concept Identifier Token",
			),
			description: translate(
				i18n,
				"settings.schema.syntax.conceptToken.desc",
				"Symbol used for ontology concept references.",
			),
		},
		{
			path: ["syntax", "delimiter"],
			type: "string",
			title: translate(
				i18n,
				"settings.schema.syntax.delimiter.title",
				"Argument Assignment Delimiter",
			),
			description: translate(
				i18n,
				"settings.schema.syntax.delimiter.desc",
				"Character separating argument names from values.",
			),
		},
		{
			path: ["values", "decimalSeparator"],
			type: "enum",
			title: translate(
				i18n,
				"settings.schema.values.decimalSeparator.title",
				"Decimal Separator",
			),
			description: translate(
				i18n,
				"settings.schema.values.decimalSeparator.desc",
				"Radix point character used in numbers.",
			),
			enumValues: [".", ","],
		},
		{
			path: ["values", "dateTimeFormat"],
			type: "string",
			title: translate(
				i18n,
				"settings.schema.values.dateTimeFormat.title",
				"Date & Time Master Display Template",
			),
			description: translate(
				i18n,
				"settings.schema.values.dateTimeFormat.desc",
				"Master display template with optional conditional brackets [YYYY[-MM[-DD]]][ HH:min[:SS]].",
			),
		},
		{
			path: ["appearance", "theme"],
			type: "enum",
			title: translate(
				i18n,
				"settings.schema.appearance.theme.title",
				"Color Theme",
			),
			description: translate(
				i18n,
				"settings.schema.appearance.theme.desc",
				"Active color palette for the terminal UI.",
			),
			enumValues: [...THEME_IDS],
		},
		{
			path: ["editor", "keymap"],
			type: "enum",
			title: translate(
				i18n,
				"settings.schema.editor.keymap.title",
				"Editor Keymap",
			),
			description: translate(
				i18n,
				"settings.schema.editor.keymap.desc",
				"Active modal keybindings profile.",
			),
			enumValues: ["default", "vim", "emacs"],
		},
	];
}
