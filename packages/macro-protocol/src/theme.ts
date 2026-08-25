export const WEB_THEME_IDS = ["midnight", "cloud", "violet"] as const;

export type WebThemeId = (typeof WEB_THEME_IDS)[number];

export interface WebThemeDefinition {
	readonly id: WebThemeId;
	readonly mode: "dark" | "light";
}

export const WEB_THEMES: readonly WebThemeDefinition[] = [
	{ id: "midnight", mode: "dark" },
	{ id: "cloud", mode: "light" },
	{ id: "violet", mode: "dark" },
];
