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
		keybindings: {},
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
			widget: "input",
			category: "syntax",
			group: "Tokens",
			title: translate(i18n, "settings.schema.syntax.macroStartToken.title"),
			description: translate(
				i18n,
				"settings.schema.syntax.macroStartToken.desc",
			),
		},
		{
			path: ["syntax", "conceptToken"],
			type: "string",
			widget: "input",
			category: "syntax",
			group: "Tokens",
			title: translate(i18n, "settings.schema.syntax.conceptToken.title"),
			description: translate(i18n, "settings.schema.syntax.conceptToken.desc"),
		},
		{
			path: ["syntax", "delimiter"],
			type: "string",
			widget: "input",
			category: "syntax",
			group: "Delimiters",
			title: translate(i18n, "settings.schema.syntax.delimiter.title"),
			description: translate(i18n, "settings.schema.syntax.delimiter.desc"),
		},
		{
			path: ["values", "decimalSeparator"],
			type: "enum",
			widget: "dropdown",
			category: "values",
			group: "Numerics",
			title: translate(i18n, "settings.schema.values.decimalSeparator.title"),
			description: translate(
				i18n,
				"settings.schema.values.decimalSeparator.desc",
			),
			enumValues: [".", ","],
		},
		{
			path: ["values", "dateTimeFormat"],
			type: "string",
			widget: "input",
			category: "values",
			group: "Temporal",
			title: translate(i18n, "settings.schema.values.dateTimeFormat.title"),
			description: translate(
				i18n,
				"settings.schema.values.dateTimeFormat.desc",
			),
		},
		{
			path: ["appearance", "theme"],
			type: "enum",
			widget: "dropdown",
			category: "appearance",
			group: "Theme",
			title: translate(i18n, "settings.schema.appearance.theme.title"),
			description: translate(i18n, "settings.schema.appearance.theme.desc"),
			enumValues: [...THEME_IDS],
		},
		{
			path: ["editor", "keybindings"],
			type: "object",
			widget: "table",
			category: "editor",
			group: "Keybindings",
			title: translate(i18n, "settings.schema.editor.keybindings.title"),
			description: translate(i18n, "settings.schema.editor.keybindings.desc"),
		},
	];
}
