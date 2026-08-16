import type { WorkspaceLocaleDictionary } from "../types";
import { EN_LOCALE } from "./en";
import { ES_LOCALE } from "./es";

export * from "./en";
export * from "./es";

/**
 * Registry of shipped and built-in locale dictionaries.
 * To add a new built-in locale, add its module here.
 */
export const BUILTIN_LOCALES: Readonly<
	Record<string, WorkspaceLocaleDictionary>
> = {
	en: EN_LOCALE,
	es: ES_LOCALE,
};
