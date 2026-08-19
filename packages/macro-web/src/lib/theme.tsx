import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";

export type WebThemeId = "midnight" | "cloud" | "violet";

export const WEB_THEME_IDS: readonly WebThemeId[] = [
	"midnight",
	"cloud",
	"violet",
];

export interface WebThemeDefinition {
	readonly id: WebThemeId;
	readonly label: string;
	readonly mode: "dark" | "light";
}

export const WEB_THEMES: readonly WebThemeDefinition[] = [
	{ id: "midnight", label: "Midnight", mode: "dark" },
	{ id: "cloud", label: "Cloud", mode: "light" },
	{ id: "violet", label: "Violet", mode: "dark" },
];

interface ThemeContextValue {
	themeId: WebThemeId;
	setThemeId: (themeId: WebThemeId) => void;
	theme: WebThemeDefinition;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { readonly children: ReactNode }) {
	const [themeId, setThemeId] = useState<WebThemeId>("midnight");
	const theme =
		WEB_THEMES.find((item) => item.id === themeId) ?? WEB_THEMES[0]!;

	useEffect(() => {
		document.documentElement.dataset.theme = theme.id;
		document.documentElement.style.colorScheme = theme.mode;
	}, [theme]);

	const value = useMemo(
		() => ({ themeId, setThemeId, theme }),
		[theme, themeId],
	);
	return (
		<ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
	);
}

export function useTheme(): ThemeContextValue {
	const value = useContext(ThemeContext);
	if (!value) throw new Error("useTheme must be used within ThemeProvider");
	return value;
}
