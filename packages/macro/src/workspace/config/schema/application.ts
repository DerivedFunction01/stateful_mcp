import { STORAGE_BACKEND_KINDS } from "@stateful-mcp/macro-protocol";
import type { I18nKernel } from "../../i18n/i18n-kernel";
import type { SettingsSchemaEntry } from "../settings-service";

export function createApplicationSchema(
	i18n?: I18nKernel,
): readonly SettingsSchemaEntry[] {
	const t = (key: string) => (i18n ? i18n.t(key) : key);

	return [
		{
			path: ["application", "uiLocale"],
			type: "enum",
			widget: "dropdown",
			category: "keymap",
			group: "i18n",
			order: 1,
			title: t("settings.schema.app.locale.title"),
			description: t("settings.schema.app.locale.desc"),
			enumValues: ["en", "es"],
			enumOptions: [
				{ id: "en", label: t("common.english") },
				{ id: "es", label: t("common.spanish") },
			],
		},
		{
			path: ["application", "storageBackend"],
			type: "enum",
			widget: "dropdown",
			category: "keymap",
			group: "storage",
			order: 2,
			title: t("settings.schema.app.storage.title"),
			description: t("settings.schema.app.storage.desc"),
			enumValues: [...STORAGE_BACKEND_KINDS],
			enumOptions: [
				{
					id: "indexeddb",
					label: t("settings.schema.app.storage.indexeddb"),
				},
				{
					id: "localstorage",
					label: t("settings.schema.app.storage.localstorage"),
				},
				{
					id: "memory",
					label: t("settings.schema.app.storage.memory"),
				},
				{
					id: "jsonl",
					label: t("settings.schema.app.storage.jsonl"),
				},
			],
		},
		{
			path: ["application", "customKeybindings"],
			type: "keymap",
			widget: "keymap",
			category: "keymap",
			group: "keyboard",
			order: 3,
			title: t("settings.schema.app.keybindings.title"),
			description: t("settings.schema.app.keybindings.desc"),
		},
	];
}
