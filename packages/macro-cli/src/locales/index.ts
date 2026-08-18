import {
	EN_LOCALE,
	type I18nKernel,
	interpolate,
	type TranslationParams,
} from "@stateful-mcp/macro";
import { EN_LOCALE_CLI } from "./en";
import { ES_LOCALE_CLI } from "./es";

export { EN_LOCALE_CLI, type LocaleKey } from "./en";
export { ES_LOCALE_CLI } from "./es";

export function registerCliLocales(i18n: I18nKernel): void {
	i18n.registerTranslations("en", EN_LOCALE_CLI, "@stateful-mcp/macro-cli");
	i18n.registerTranslations("es", ES_LOCALE_CLI, "@stateful-mcp/macro-cli");
}

/**
 * Core translation lookup. The registered `en` dictionary is the authoritative
 * single source of truth for English strings. When no kernel is available the
 * canonical dictionaries are consulted directly (CLI takes precedence over core
 * because it registers after it at runtime). Missing keys return the raw key.
 */
export function translate(
	i18n: I18nKernel | undefined,
	key: string,
	params?: TranslationParams,
): string {
	if (i18n) return i18n.t(key, params);
	const template: string | undefined =
		(EN_LOCALE_CLI as Record<string, string>)[key] ?? EN_LOCALE[key];
	return template ? interpolate(template, params) : key;
}

/**
 * Resolves a human-readable display label for extensible entities with an
 * optional i18n key. Hierarchy: translated i18nKey -> declared label/title ->
 * "" (caller decides how to handle the empty fallback).
 */
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

export const t = translate;
