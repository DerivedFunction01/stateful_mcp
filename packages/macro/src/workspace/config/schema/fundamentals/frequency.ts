import { CADENCE_TYPES } from "../../../../values/frequency";
import type { I18nKernel } from "../../../i18n/i18n-kernel";
import type { SettingsSchemaEntry } from "../../settings-service";

export function createFrequencySchema(
	i18n?: I18nKernel,
): readonly SettingsSchemaEntry[] {
	const t = (key: string) => (i18n ? i18n.t(key) : key);

	return [
		{
			path: ["values", "frequency", "defaultInterval"],
			type: "enum",
			widget: "dropdown",
			category: "values",
			group: "frequency",
			order: 1,
			title: t("settings.schema.values.cadence.title"),
			description: t("settings.schema.values.cadence.desc"),
			enumValues: [...CADENCE_TYPES],
			enumOptions: CADENCE_TYPES.map((cadence) => ({
				id: cadence,
				label: cadence.charAt(0).toUpperCase() + cadence.slice(1),
			})),
		},
	];
}
