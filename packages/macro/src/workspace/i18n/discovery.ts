import { I18nKernel } from "./i18n-kernel";
import { BUILTIN_LOCALES } from "./locales";
import type { WorkspaceLocaleDictionary } from "./types";

export * from "./locales";
export * from "./types";

export interface LocaleRegistration {
	readonly languageId: string;
	readonly dictionary: WorkspaceLocaleDictionary | Record<string, string>;
}

export function createDefaultI18nKernel(
	initialLocale = "en",
	extraLocales: readonly LocaleRegistration[] = [],
): I18nKernel {
	const kernel = new I18nKernel(initialLocale);

	// Register all configured built-in and shipped locales
	for (const [langId, dict] of Object.entries(BUILTIN_LOCALES)) {
		kernel.registerTranslations(langId, dict);
	}

	// Register any dynamically supplied or extension locales
	for (const reg of extraLocales) {
		kernel.registerTranslations(reg.languageId, reg.dictionary);
	}

	return kernel;
}
