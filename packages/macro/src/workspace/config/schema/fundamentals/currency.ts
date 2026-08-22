import { STANDARD_CURRENCY_CATALOG } from "../../../../values/currency";
import type { I18nKernel } from "../../../i18n/i18n-kernel";
import type { SettingsSchemaEntry } from "../../settings-service";

export function createCurrencySchema(
	i18n?: I18nKernel,
): readonly SettingsSchemaEntry[] {
	const t = (key: string) => (i18n ? i18n.t(key) : key);

	return [
		{
			path: ["values", "currency", "defaultCurrency"],
			type: "enum",
			widget: "dropdown",
			category: "values",
			group: "currency",
			order: 1,
			title: t("settings.schema.values.currency.title"),
			description: t("settings.schema.values.currency.desc"),
			enumValues: STANDARD_CURRENCY_CATALOG.map((c) => c.code),
			enumOptions: STANDARD_CURRENCY_CATALOG.map((c) => ({
				id: c.code,
				label: c.symbols?.[0] ? `${c.code} (${c.symbols[0]})` : c.code,
			})),
		},
		{
			path: ["values", "currency", "formatTemplate"],
			type: "string",
			widget: "input",
			category: "values",
			group: "currency",
			order: 2,
			title: t("settings.schema.values.currencyFormat.title"),
			description: t("settings.schema.values.currencyFormat.desc"),
		},
	];
}
