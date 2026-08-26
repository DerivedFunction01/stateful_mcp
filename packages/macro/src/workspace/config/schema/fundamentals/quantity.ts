import { STANDARD_UNIT_BUNDLES } from "../../../../values/conversion/standard-units";
import type { I18nKernel } from "../../../i18n/i18n-kernel";
import type { SettingsSchemaEntry } from "../../settings-service";

export function createQuantitySchema(
	i18n?: I18nKernel,
): readonly SettingsSchemaEntry[] {
	const t = (key: string) => (i18n ? i18n.t(key) : key);

	return [
		{
			path: ["values", "quantity", "defaultSystem"],
			type: "enum",
			widget: "dropdown",
			category: "values",
			group: "quantity",
			order: 1,
			title: t("settings.schema.values.quantitySystem.title"),
			description: t("settings.schema.values.quantitySystem.desc"),
			enumValues: [...STANDARD_UNIT_BUNDLES],
			enumOptions: [
				{
					id: "si",
					label: t("settings.schema.values.quantitySystem.si"),
				},
				{
					id: "us-customary",
					label: t("settings.schema.values.quantitySystem.usCustomary"),
				},
				{
					id: "imperial",
					label: t("settings.schema.values.quantitySystem.imperial"),
				},
			],
		},
		{
			path: ["values", "quantity", "rangeComponents"],
			type: "json",
			widget: "json-editor",
			category: "values",
			group: "quantity",
			order: 2,
			title: t("settings.schema.values.quantityRangeComponents.title"),
			description: t("settings.schema.values.quantityRangeComponents.desc"),
		},
	];
}
