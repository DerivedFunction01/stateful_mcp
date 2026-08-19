import type {
	I18nKernel,
	NumericParseOptions,
	SettingsSchemaEntry,
} from "@stateful-mcp/macro";
import { translate } from "@stateful-mcp/macro";
import type { SettingsModule } from "../registry";

export const DEFAULT_NUMERIC_SETTINGS: Partial<NumericParseOptions> = {
	decimalSeparator: ".",
	thousandsSeparator: ",",
	allowFractions: false,
	allowScientific: false,
};

export const numericSettingsModule: SettingsModule<
	Partial<NumericParseOptions>
> = {
	id: "values.numeric",
	category: "values",
	group: "Numerics",
	rootPath: ["values", "numeric"],
	defaultValues: DEFAULT_NUMERIC_SETTINGS,

	getSchema(i18n?: I18nKernel): readonly SettingsSchemaEntry[] {
		return [
			{
				path: ["values", "numeric", "decimalSeparator"],
				type: "enum",
				widget: "dropdown",
				category: "values",
				group: "Numerics",
				title: translate(
					i18n,
					"settings.schema.values.numeric.decimalSeparator.title",
				),
				description: translate(
					i18n,
					"settings.schema.values.numeric.decimalSeparator.desc",
				),
				enumOptions: [
					{ id: ".", label: ". (Period / Dot)" },
					{ id: ",", label: ", (Comma / Radix)" },
				],
			},
			{
				path: ["values", "numeric", "thousandsSeparator"],
				type: "enum",
				widget: "dropdown",
				category: "values",
				group: "Numerics",
				title: translate(
					i18n,
					"settings.schema.values.numeric.thousandsSeparator.title",
				),
				description: translate(
					i18n,
					"settings.schema.values.numeric.thousandsSeparator.desc",
				),
				enumOptions: [
					{ id: ",", label: ", (Comma)" },
					{ id: ".", label: ". (Dot)" },
					{ id: " ", label: "Space (Thin Space)" },
					{ id: "", label: "None (Disabled)" },
				],
			},
			{
				path: ["values", "numeric", "allowFractions"],
				type: "boolean",
				widget: "toggle",
				category: "values",
				group: "Numerics",
				title: translate(
					i18n,
					"settings.schema.values.numeric.allowFractions.title",
				),
				description: translate(
					i18n,
					"settings.schema.values.numeric.allowFractions.desc",
				),
			},
			{
				path: ["values", "numeric", "allowScientific"],
				type: "boolean",
				widget: "toggle",
				category: "values",
				group: "Numerics",
				title: translate(
					i18n,
					"settings.schema.values.numeric.allowScientific.title",
				),
				description: translate(
					i18n,
					"settings.schema.values.numeric.allowScientific.desc",
				),
			},
		];
	},
};
