import {
	type I18nKernel,
	parseFormatTemplate,
	QUANTITY_TOKENS,
	type QuantityGrammarConfig,
	type SettingsDiagnostic,
	type SettingsSchemaEntry,
	translate,
} from "@stateful-mcp/macro";
import type { SettingsModule } from "../registry";

export const DEFAULT_QUANTITY_SETTINGS: Partial<QuantityGrammarConfig> = {
	templates: [
		"NUM UNIT",
		"OP_PREFIX NUM UNIT",
		"NUM_LOW-NUM_HIGH UNIT",
		"NUM PKG_CLASSIFIER FILLER UNIT",
	],
	rangeDelimiters: ["-", "–", "to", "until"],
	fillerConnectors: ["of", "de", "von"],
};

export const quantitySettingsModule: SettingsModule<
	Partial<QuantityGrammarConfig>
> = {
	id: "values.quantity",
	category: "values",
	group: "Quantity",
	rootPath: ["values", "quantity"],
	defaultValues: DEFAULT_QUANTITY_SETTINGS,

	getSchema(i18n?: I18nKernel): readonly SettingsSchemaEntry[] {
		return [
			{
				path: ["values", "quantity", "templates"],
				type: "array",
				widget: "tag-input",
				category: "values",
				group: "Quantity",
				title: translate(
					i18n,
					"settings.schema.values.quantity.templates.title",
				),
				description: translate(
					i18n,
					"settings.schema.values.quantity.templates.desc",
				),
			},
			{
				path: ["values", "quantity", "rangeDelimiters"],
				type: "array",
				widget: "tag-input",
				category: "values",
				group: "Quantity",
				title: translate(
					i18n,
					"settings.schema.values.quantity.rangeDelimiters.title",
				),
				description: translate(
					i18n,
					"settings.schema.values.quantity.rangeDelimiters.desc",
				),
			},
			{
				path: ["values", "quantity", "fillerConnectors"],
				type: "array",
				widget: "tag-input",
				category: "values",
				group: "Quantity",
				title: translate(
					i18n,
					"settings.schema.values.quantity.fillerConnectors.title",
				),
				description: translate(
					i18n,
					"settings.schema.values.quantity.fillerConnectors.desc",
				),
			},
		];
	},

	validate(
		draft?: Partial<QuantityGrammarConfig>,
	): readonly SettingsDiagnostic[] {
		const diagnostics: SettingsDiagnostic[] = [];
		if (draft?.templates && Array.isArray(draft.templates)) {
			for (const tpl of draft.templates) {
				if (typeof tpl === "string") {
					const parsed = parseFormatTemplate(tpl, QUANTITY_TOKENS);
					if (parsed.tokens.length === 0) {
						diagnostics.push({
							severity: "error",
							path: ["values", "quantity", "templates"],
							message: `Template '${tpl}' contains no recognized quantity tokens`,
						});
					}
				}
			}
		}
		return diagnostics;
	},
};
