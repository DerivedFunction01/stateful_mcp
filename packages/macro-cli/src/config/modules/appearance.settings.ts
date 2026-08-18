import type { I18nKernel, SettingsSchemaEntry } from "@stateful-mcp/macro";
import { translate } from "../../locales";
import type { SettingsModule } from "../registry";

export interface AppearanceConfig {
	readonly theme?: string;
	readonly showBounds?: boolean;
}

export const DEFAULT_APPEARANCE_SETTINGS: AppearanceConfig = {
	theme: "default",
	showBounds: false,
};

export const appearanceSettingsModule: SettingsModule<AppearanceConfig> = {
	id: "appearance",
	category: "appearance",
	group: "Theme & Styling",
	rootPath: ["appearance"],
	defaultValues: DEFAULT_APPEARANCE_SETTINGS,

	getSchema(i18n?: I18nKernel): readonly SettingsSchemaEntry[] {
		return [
			{
				path: ["appearance", "theme"],
				type: "enum",
				widget: "dropdown",
				category: "appearance",
				group: "Appearance",
				title: translate(i18n, "settings.schema.appearance.theme.title"),
				description: translate(
					i18n,
					"settings.schema.appearance.theme.desc",
				),
				enumOptions: [
					{ id: "default", label: "Default (Dark Theme)" },
					{ id: "github-dark", label: "GitHub Dark" },
					{ id: "nord", label: "Nord Frost" },
					{ id: "monokai", label: "Monokai Pro" },
					{ id: "solarized-dark", label: "Solarized Dark" },
					{ id: "light", label: "High-Contrast Light" },
				],
			},
			{
				path: ["appearance", "showBounds"],
				type: "boolean",
				widget: "toggle",
				category: "appearance",
				group: "Appearance",
				title: translate(
					i18n,
					"settings.schema.appearance.showBounds.title",
				),
				description: translate(
					i18n,
					"settings.schema.appearance.showBounds.desc",
				),
			},
		];
	},
};
