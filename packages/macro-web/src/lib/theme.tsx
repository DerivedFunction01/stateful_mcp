import {
	WEB_THEME_IDS,
	WEB_THEMES,
	type WebThemeDefinition,
	type WebThemeId,
} from "@stateful-mcp/macro-protocol";
import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";
import { useOptionalI18n } from "./macro-i18n-provider";

export { WEB_THEME_IDS, WEB_THEMES, type WebThemeDefinition, type WebThemeId };

interface ThemeContextValue {
	themeId: WebThemeId;
	setThemeId: (themeId: WebThemeId) => void;
	theme: WebThemeDefinition;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { readonly children: ReactNode }) {
	const i18n = useOptionalI18n();
	const t = i18n?.t ?? ((key: string) => key);
	const [themeId, setThemeId] = useState<WebThemeId>("midnight");
	const baseTheme =
		WEB_THEMES.find((item) => item.id === themeId) ?? WEB_THEMES[0]!;

	const theme = useMemo(() => baseTheme, [baseTheme]);

	useEffect(() => {
		document.documentElement.dataset.theme = theme.id;
		document.documentElement.style.colorScheme = theme.mode;
	}, [theme.id, theme.mode]);

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
