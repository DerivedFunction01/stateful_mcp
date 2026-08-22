import { generateTimeZoneCodeMap } from "../../../../values/time-zone";
import type { I18nKernel } from "../../../i18n/i18n-kernel";
import type { SettingsSchemaEntry } from "../../settings-service";

export function createDateTimeSchema(
	i18n?: I18nKernel,
): readonly SettingsSchemaEntry[] {
	const t = (key: string, params?: Record<string, unknown>) =>
		i18n ? i18n.t(key, params) : key;

	let systemTz = "UTC";
	try {
		if (typeof Intl !== "undefined" && Intl.DateTimeFormat) {
			systemTz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
		}
	} catch {
		// Fallback
	}

	let supportedZones: readonly string[] = [];
	if (
		typeof Intl !== "undefined" &&
		typeof Intl.supportedValuesOf === "function"
	) {
		supportedZones = Intl.supportedValuesOf("timeZone");
	} else {
		const codeMap = generateTimeZoneCodeMap();
		supportedZones = Array.from(new Set(Object.values(codeMap))).sort();
	}

	const enumValues = [
		"system",
		"UTC",
		...supportedZones.filter((z) => z !== "UTC"),
	];

	return [
		{
			path: ["values", "dateTime", "defaultTimeZone"],
			type: "enum",
			widget: "dropdown",
			category: "values",
			group: "dateTime",
			order: 1,
			title: t("settings.schema.values.timezone.title"),
			description: t("settings.schema.values.timezone.desc"),
			enumValues,
			enumOptions: enumValues.map((zone) => ({
				id: zone,
				label:
					zone === "system"
						? t("settings.schema.values.timezone.system", { tz: systemTz })
						: zone,
			})),
		},
		{
			path: ["values", "dateTime", "formatTemplate"],
			type: "string",
			widget: "input",
			category: "values",
			group: "dateTime",
			order: 2,
			title: t("settings.schema.values.dateTimeFormat.title"),
			description: t("settings.schema.values.dateTimeFormat.desc"),
		},
	];
}
