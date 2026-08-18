import type { I18nKernel, SettingsSchemaEntry } from "@stateful-mcp/macro";
import { translate } from "../../locales";
import type { SettingsModule } from "../registry";

export interface EditorConfig {
	readonly keybindings?: Record<string, readonly string[]>;
	readonly tabSize?: number;
	readonly wordWrap?: boolean;
}

export const DEFAULT_EDITOR_SETTINGS: EditorConfig = {
	keybindings: {},
	tabSize: 2,
	wordWrap: false,
};

export const editorSettingsModule: SettingsModule<EditorConfig> = {
	id: "editor",
	category: "editor",
	group: "Editor Settings",
	rootPath: ["editor"],
	defaultValues: DEFAULT_EDITOR_SETTINGS,

	getSchema(i18n?: I18nKernel): readonly SettingsSchemaEntry[] {
		return [
			{
				path: ["editor", "keybindings"],
				type: "object",
				widget: "input",
				category: "editor",
				group: "Editor",
				title: translate(i18n, "settings.schema.editor.keybindings.title"),
				description: translate(i18n, "settings.schema.editor.keybindings.desc"),
			},
			{
				path: ["editor", "tabSize"],
				type: "number",
				widget: "input",
				category: "editor",
				group: "Editor",
				title: translate(i18n, "settings.schema.editor.tabSize.title"),
				description: translate(i18n, "settings.schema.editor.tabSize.desc"),
			},
			{
				path: ["editor", "wordWrap"],
				type: "boolean",
				widget: "toggle",
				category: "editor",
				group: "Editor",
				title: translate(i18n, "settings.schema.editor.wordWrap.title"),
				description: translate(i18n, "settings.schema.editor.wordWrap.desc"),
			},
		];
	},
};
