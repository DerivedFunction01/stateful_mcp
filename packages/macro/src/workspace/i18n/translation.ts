import type { I18nKernel, TranslationParams } from "./i18n-kernel";
import { EN_LOCALE, ES_LOCALE } from "./locales";

export function translate(
	i18n: I18nKernel | undefined,
	key: string,
	params?: TranslationParams,
): string {
	if (!i18n) return key;
	return i18n.t(key, params);
}

export function resolveLabel(
	i18n: I18nKernel | undefined,
	i18nKey?: string,
	defaultLabel?: string,
): string {
	if (i18nKey) {
		const translated = translate(i18n, i18nKey);
		if (translated !== i18nKey) return translated;
	}
	return defaultLabel ?? "";
}

export function registerMacroLocales(i18n: I18nKernel): void {
	// Built-in locales are normally installed by createDefaultI18nKernel. This
	// helper is for callers that construct a bare kernel, such as CLI fixtures.
	i18n.registerTranslations("en", EN_LOCALE, "@stateful-mcp/macro");
	i18n.registerTranslations("es", ES_LOCALE, "@stateful-mcp/macro");
}

export const t = translate;
