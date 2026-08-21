import { createDefaultI18nKernel } from "@stateful-mcp/macro/workspace/i18n/discovery";
import type {
	I18nKernel,
	TranslationParams,
} from "@stateful-mcp/macro/workspace/i18n/i18n-kernel";
import type { I18nKey } from "@stateful-mcp/macro/workspace/i18n/locales/i18n-keys";

export type WebI18nKey = I18nKey | keyof (typeof GALLERY_TRANSLATIONS)["en"];

import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useMemo,
	useSyncExternalStore,
} from "react";
import { GALLERY_TRANSLATIONS } from "./gallery-locale";

export interface MacroWebI18n {
	readonly locale: string;
	readonly setLocale: (locale: string) => void;
	t(key: WebI18nKey, fallback?: string, params?: TranslationParams): string;
}

interface I18nContextValue {
	readonly publicValue: MacroWebI18n;
	readonly kernel: I18nKernel;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function valueForKernel(kernel: I18nKernel): MacroWebI18n {
	return {
		locale: kernel.getActiveLocale(),
		setLocale: (locale) => kernel.setActiveLocale(locale),
		t: (key, fallback = key, params) => {
			const translated = kernel.t(key, params);
			return translated === key ? fallback : translated;
		},
	};
}

export function I18nProvider({ children }: { readonly children: ReactNode }) {
	const kernel = useMemo(() => createDefaultI18nKernel("en"), []);
	useEffect(() => {
		for (const [locale, dictionary] of Object.entries(GALLERY_TRANSLATIONS))
			kernel.registerTranslations(locale, dictionary, "macro-web-core");
		return () => kernel.unregisterOwner("macro-web-core");
	}, [kernel]);
	const locale = useSyncExternalStore(
		(listener) => kernel.subscribe(listener),
		() => kernel.getActiveLocale(),
	);
	const value = useMemo(() => valueForKernel(kernel), [kernel, locale]);
	return (
		<I18nContext.Provider value={{ publicValue: value, kernel }}>
			{children}
		</I18nContext.Provider>
	);
}

export function GalleryI18nScope({
	children,
}: {
	readonly children: ReactNode;
}) {
	const context = useContext(I18nContext);
	if (!context) throw new Error("GalleryI18nScope must be inside I18nProvider");
	const kernel = context.kernel;
	useEffect(() => {
		for (const [locale, dictionary] of Object.entries(GALLERY_TRANSLATIONS))
			kernel.registerTranslations(locale, dictionary, "macro-web-gallery");
		return () => kernel.unregisterOwner("macro-web-gallery");
	}, [kernel]);
	return <>{children}</>;
}

export function useI18n(): MacroWebI18n {
	const context = useContext(I18nContext);
	if (!context) throw new Error("useI18n must be used within I18nProvider");
	return context.publicValue;
}
