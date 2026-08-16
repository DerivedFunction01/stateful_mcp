import type { I18nKernel } from "@stateful-mcp/macro";
import { EN_LOCALE_CLI } from "./en";
import { ES_LOCALE_CLI } from "./es";

export { EN_LOCALE_CLI } from "./en";
export { ES_LOCALE_CLI } from "./es";

export function registerCliLocales(i18n: I18nKernel): void {
	i18n.registerTranslations("en", EN_LOCALE_CLI, "@stateful-mcp/macro-cli");
	i18n.registerTranslations("es", ES_LOCALE_CLI, "@stateful-mcp/macro-cli");
}

export function translate(
	i18n: I18nKernel | undefined,
	key: string,
	fallback: string,
	params?: Readonly<Record<string, unknown>>,
): string {
	if (!i18n) return fallback;
	const resolved = i18n.t(key, params);
	return resolved === key ? fallback : resolved;
}
