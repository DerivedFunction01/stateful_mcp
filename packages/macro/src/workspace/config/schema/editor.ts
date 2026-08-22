import type { I18nKernel } from "../../i18n/i18n-kernel";
import type { SettingsSchemaEntry } from "../settings-service";

export function createEditorSchema(
	i18n?: I18nKernel,
): readonly SettingsSchemaEntry[] {
	const t = (key: string) => (i18n ? i18n.t(key) : key);

	return [
		{
			path: ["editor", "vimEnabled"],
			type: "boolean",
			widget: "toggle",
			category: "editor",
			group: "general",
			order: 1,
			title: t("settings.schema.editor.vim.title"),
			description: t("settings.schema.editor.vim.desc"),
		},
		{
			path: ["editor", "autoPurgeOnExecute"],
			type: "boolean",
			widget: "toggle",
			category: "editor",
			group: "execution",
			order: 2,
			title: t("settings.schema.editor.autoPurge.title"),
			description: t("settings.schema.editor.autoPurge.desc"),
		},
		{
			path: ["editor", "fontSize"],
			type: "number",
			widget: "input",
			category: "editor",
			group: "font",
			order: 3,
			title: t("settings.schema.editor.fontSize.title"),
			description: t("settings.schema.editor.fontSize.desc"),
			min: 10,
			max: 32,
			step: 1,
		},
		{
			path: ["editor", "tabSize"],
			type: "number",
			widget: "dropdown",
			category: "editor",
			group: "formatting",
			order: 4,
			title: t("settings.schema.editor.tabSize.title"),
			description: t("settings.schema.editor.tabSize.desc"),
			enumValues: ["2", "4", "8"],
			enumOptions: [
				{ id: "2", label: "2" },
				{ id: "4", label: "4" },
				{ id: "8", label: "8" },
			],
		},
	];
}
