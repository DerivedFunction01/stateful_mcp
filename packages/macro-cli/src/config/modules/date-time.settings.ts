import type {
	DateTimeFormatRegistry,
	I18nKernel,
	SettingsSchemaEntry,
} from "@stateful-mcp/macro";
import { translate } from "../../locales";
import type { SettingsModule } from "../registry";

export interface DateTimeSettingsPayload {
	readonly defaultFormat?: string;
	readonly is24Hour?: boolean;
	readonly defaultTimeZone?: string;
}

export const DEFAULT_DATETIME_SETTINGS: DateTimeSettingsPayload = {
	defaultFormat: "[YYYY[-MM[-DD]]][ HH:min[:SS]]",
	is24Hour: true,
	defaultTimeZone: "UTC",
};

export const dateTimeSettingsModule: SettingsModule<DateTimeSettingsPayload> = {
	id: "values.dateTime",
	category: "values",
	group: "Temporal",
	rootPath: ["values", "dateTime"],
	defaultValues: DEFAULT_DATETIME_SETTINGS,

	getSchema(i18n?: I18nKernel): readonly SettingsSchemaEntry[] {
		return [
			{
				path: ["values", "dateTime", "defaultFormat"],
				type: "string",
				widget: "input",
				category: "values",
				group: "Temporal",
				title: translate(
					i18n,
					"settings.schema.values.dateTime.defaultFormat.title",
				),
				description: translate(
					i18n,
					"settings.schema.values.dateTime.defaultFormat.desc",
				),
			},
			{
				path: ["values", "dateTime", "is24Hour"],
				type: "boolean",
				widget: "toggle",
				category: "values",
				group: "Temporal",
				title: translate(
					i18n,
					"settings.schema.values.dateTime.is24Hour.title",
				),
				description: translate(
					i18n,
					"settings.schema.values.dateTime.is24Hour.desc",
				),
			},
			{
				path: ["values", "dateTime", "defaultTimeZone"],
				type: "string",
				widget: "input",
				category: "values",
				group: "Temporal",
				title: translate(
					i18n,
					"settings.schema.values.dateTime.defaultTimeZone.title",
				),
				description: translate(
					i18n,
					"settings.schema.values.dateTime.defaultTimeZone.desc",
				),
			},
		];
	},
};
