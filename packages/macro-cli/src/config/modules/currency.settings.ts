import type {
	CurrencyFormatConfig,
	I18nKernel,
	SettingsSchemaEntry,
} from "@stateful-mcp/macro";
import { translate } from "@stateful-mcp/macro";
import type { SettingsModule } from "../registry";

export const DEFAULT_CURRENCY_SETTINGS: Partial<CurrencyFormatConfig> = {
	defaultCurrency: "USD",
	templates: ["SYM AMOUNT", "CODE AMOUNT", "AMOUNT CODE"],
	negativeStyle: "sign",
	position: "prefix",
};

export const currencySettingsModule: SettingsModule<
	Partial<CurrencyFormatConfig>
> = {
	id: "values.currency",
	category: "values",
	group: "Currency",
	rootPath: ["values", "currency"],
	defaultValues: DEFAULT_CURRENCY_SETTINGS,

	getSchema(i18n?: I18nKernel): readonly SettingsSchemaEntry[] {
		return [
			{
				path: ["values", "currency", "defaultCurrency"],
				type: "string",
				widget: "input",
				category: "values",
				group: "Currency",
				title: translate(
					i18n,
					"settings.schema.values.currency.defaultCurrency.title",
				),
				description: translate(
					i18n,
					"settings.schema.values.currency.defaultCurrency.desc",
				),
			},
			{
				path: ["values", "currency", "templates"],
				type: "array",
				widget: "tag-input",
				category: "values",
				group: "Currency",
				title: translate(
					i18n,
					"settings.schema.values.currency.templates.title",
				),
				description: translate(
					i18n,
					"settings.schema.values.currency.templates.desc",
				),
			},
			{
				path: ["values", "currency", "negativeStyle"],
				type: "enum",
				widget: "dropdown",
				category: "values",
				group: "Currency",
				title: translate(
					i18n,
					"settings.schema.values.currency.accountingParens.title",
				),
				description: translate(
					i18n,
					"settings.schema.values.currency.accountingParens.desc",
				),
				enumOptions: [
					{ id: "sign", label: "-$100 (Minus Sign)" },
					{ id: "parens", label: "($100) (Accounting Parens)" },
					{ id: "both", label: "Both (Sign & Parens)" },
				],
			},
		];
	},
};
