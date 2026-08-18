import {
	FREQUENCY_TOKENS,
	type FrequencyGrammarConfig,
	type I18nKernel,
	parseFormatTemplate,
	type SettingsDiagnostic,
	type SettingsSchemaEntry,
} from "@stateful-mcp/macro";
import { translate } from "../../locales";
import type { SettingsModule } from "../registry";

export const DEFAULT_FREQUENCY_SETTINGS: Partial<FrequencyGrammarConfig> = {
	templates: [
		"every INTERVAL_MAG-INTERVAL_HIGH INTERVAL_UNIT",
		"every INTERVAL_MAG INTERVAL_UNIT",
		"RECURRENCE_COUNT RECURRENCE_CONN PERIOD",
		"OFFSET_MAG OFFSET_UNIT OFFSET_DIR ANCHOR",
		"ANCHOR",
	],
	intervalPrefixes: ["every", "q"],
	recurrenceConnectors: ["times a", "x a", "x/", "per", "/"],
	conditionalAliases: ["prn", "p.r.n.", "as needed", "on demand"],
	conditionConnectors: ["for", "due to", "on", "with"],
	rangeDelimiters: ["-", "–", "to", "until"],
};

export const frequencySettingsModule: SettingsModule<
	Partial<FrequencyGrammarConfig>
> = {
	id: "values.frequency",
	category: "values",
	group: "Frequency",
	rootPath: ["values", "frequency"],
	defaultValues: DEFAULT_FREQUENCY_SETTINGS,

	getSchema(i18n?: I18nKernel): readonly SettingsSchemaEntry[] {
		return [
			{
				path: ["values", "frequency", "templates"],
				type: "array",
				widget: "tag-input",
				category: "values",
				group: "Frequency",
				title: translate(
					i18n,
					"settings.schema.values.frequency.templates.title",
				),
				description: translate(
					i18n,
					"settings.schema.values.frequency.templates.desc",
				),
			},
			{
				path: ["values", "frequency", "intervalPrefixes"],
				type: "array",
				widget: "tag-input",
				category: "values",
				group: "Frequency",
				title: translate(
					i18n,
					"settings.schema.values.frequency.intervalPrefixes.title",
				),
				description: translate(
					i18n,
					"settings.schema.values.frequency.intervalPrefixes.desc",
				),
			},
			{
				path: ["values", "frequency", "recurrenceConnectors"],
				type: "array",
				widget: "tag-input",
				category: "values",
				group: "Frequency",
				title: translate(
					i18n,
					"settings.schema.values.frequency.recurrenceConnectors.title",
				),
				description: translate(
					i18n,
					"settings.schema.values.frequency.recurrenceConnectors.desc",
				),
			},
			{
				path: ["values", "frequency", "conditionalAliases"],
				type: "array",
				widget: "tag-input",
				category: "values",
				group: "Frequency",
				title: translate(
					i18n,
					"settings.schema.values.frequency.conditionalAliases.title",
				),
				description: translate(
					i18n,
					"settings.schema.values.frequency.conditionalAliases.desc",
				),
			},
			{
				path: ["values", "frequency", "conditionConnectors"],
				type: "array",
				widget: "tag-input",
				category: "values",
				group: "Frequency",
				title: translate(
					i18n,
					"settings.schema.values.frequency.conditionConnectors.title",
				),
				description: translate(
					i18n,
					"settings.schema.values.frequency.conditionConnectors.desc",
				),
			},
			{
				path: ["values", "frequency", "rangeDelimiters"],
				type: "array",
				widget: "tag-input",
				category: "values",
				group: "Frequency",
				title: translate(
					i18n,
					"settings.schema.values.frequency.rangeDelimiters.title",
				),
				description: translate(
					i18n,
					"settings.schema.values.frequency.rangeDelimiters.desc",
				),
			},
		];
	},

	validate(
		draft?: Partial<FrequencyGrammarConfig>,
	): readonly SettingsDiagnostic[] {
		const diagnostics: SettingsDiagnostic[] = [];
		if (draft?.templates && Array.isArray(draft.templates)) {
			for (const tpl of draft.templates) {
				if (typeof tpl === "string") {
					const parsed = parseFormatTemplate(tpl, FREQUENCY_TOKENS);
					if (parsed.tokens.length === 0) {
						diagnostics.push({
							severity: "error",
							path: ["values", "frequency", "templates"],
							message: `Template '${tpl}' contains no recognized frequency tokens`,
						});
					}
				}
			}
		}
		return diagnostics;
	},
};
