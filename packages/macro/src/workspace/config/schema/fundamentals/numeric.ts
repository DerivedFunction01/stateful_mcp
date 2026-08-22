import type { I18nKernel } from "../../../i18n/i18n-kernel";
import type { SettingsSchemaEntry } from "../../settings-service";

export function createNumericSchema(
	i18n?: I18nKernel,
): readonly SettingsSchemaEntry[] {
	const t = (key: string) => (i18n ? i18n.t(key) : key);

	return [
		{
			path: ["values", "numeric", "decimalSeparator"],
			type: "enum",
			widget: "dropdown",
			category: "values",
			group: "numeric",
			order: 1,
			title: t("settings.schema.values.decimalSep.title"),
			description: t("settings.schema.values.decimalSep.desc"),
			enumValues: [".", ","],
			enumOptions: [
				{
					id: ".",
					label: t("settings.schema.values.decimalSep.dot"),
				},
				{
					id: ",",
					label: t("settings.schema.values.decimalSep.comma"),
				},
			],
		},
		{
			path: ["values", "numeric", "groupingSeparator"],
			type: "enum",
			widget: "dropdown",
			category: "values",
			group: "numeric",
			order: 2,
			title: t("settings.schema.values.groupingSep.title"),
			description: t("settings.schema.values.groupingSep.desc"),
			enumValues: [",", ".", " ", ""],
			enumOptions: [
				{
					id: ",",
					label: t("settings.schema.values.groupingSep.comma"),
				},
				{
					id: ".",
					label: t("settings.schema.values.groupingSep.dot"),
				},
				{
					id: " ",
					label: t("settings.schema.values.groupingSep.space"),
				},
				{
					id: "",
					label: t("settings.schema.values.groupingSep.none"),
				},
			],
		},
	];
}
