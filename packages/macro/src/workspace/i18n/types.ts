/**
 * Typed interface for workspace and shell localization dictionaries.
 */

export interface WorkspaceLocaleDictionary {
	readonly [key: string]: string;
}

export type { I18nKey } from "./locales/i18n-keys";
