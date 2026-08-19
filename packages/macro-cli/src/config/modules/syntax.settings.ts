import type {
	I18nKernel,
	MacroSyntax,
	SettingsSchemaEntry,
} from "@stateful-mcp/macro";
import { translate } from "@stateful-mcp/macro";
import type { SettingsModule } from "../registry";

export const DEFAULT_SYNTAX_SETTINGS: Partial<MacroSyntax> = {
	macroStartToken: "@",
	conceptToken: "#",
	argumentDelimiter: "=",
};

export const syntaxSettingsModule: SettingsModule<Partial<MacroSyntax>> = {
	id: "syntax",
	category: "syntax",
	group: "Syntax",
	rootPath: ["syntax"],
	defaultValues: DEFAULT_SYNTAX_SETTINGS,

	getSchema(i18n?: I18nKernel): readonly SettingsSchemaEntry[] {
		return [
			{
				path: ["syntax", "macroStartToken"],
				type: "string",
				widget: "input",
				category: "syntax",
				group: "Core Tokens",
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
				group: "Core Tokens",
				title: translate(i18n, "settings.schema.syntax.conceptToken.title"),
				description: translate(
					i18n,
					"settings.schema.syntax.conceptToken.desc",
				),
			},
			{
				path: ["syntax", "argumentDelimiter"],
				type: "string",
				widget: "input",
				category: "syntax",
				group: "Core Tokens",
				title: translate(i18n, "settings.schema.syntax.delimiter.title"),
				description: translate(i18n, "settings.schema.syntax.delimiter.desc"),
			},
		];
	},
};
