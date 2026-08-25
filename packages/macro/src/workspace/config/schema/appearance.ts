import { WEB_THEME_IDS, WEB_THEMES } from "@stateful-mcp/macro-protocol";
import type { I18nKernel } from "../../i18n/i18n-kernel";
import type { SettingsSchemaEntry } from "../settings-service";

export function createAppearanceSchema(
	i18n?: I18nKernel,
): readonly SettingsSchemaEntry[] {
	const t = (key: string) => (i18n ? i18n.t(key) : key);

	return [
		{
			path: ["workbench", "theme"],
			type: "enum",
			widget: "dropdown",
			category: "appearance",
			group: "appearance",
			order: 1,
			title: t("settings.schema.appearance.theme.title"),
			description: t("settings.schema.appearance.theme.desc"),
			enumValues: [...WEB_THEME_IDS],
			enumOptions: WEB_THEMES.map((th) => ({
				id: th.id,
				label: t(`theme.${th.id}`),
			})),
		},
		{
			path: ["workbench", "inspectorPosition"],
			type: "enum",
			widget: "dropdown",
			category: "appearance",
			group: "layout",
			order: 2,
			title: t("settings.schema.workbench.inspectorPos.title"),
			description: t("settings.schema.workbench.inspectorPos.desc"),
			enumValues: ["right", "left"],
			enumOptions: [
				{
					id: "right",
					label: t("settings.schema.workbench.inspectorPos.right"),
				},
				{
					id: "left",
					label: t("settings.schema.workbench.inspectorPos.left"),
				},
			],
		},
		{
			path: ["workbench", "inspectorWidth"],
			type: "number",
			widget: "input",
			category: "appearance",
			group: "layout",
			order: 3,
			title: t("settings.schema.workbench.inspectorWidth.title"),
			description: t("settings.schema.workbench.inspectorWidth.desc"),
			min: 160,
			max: 800,
			step: 10,
		},
	];
}
