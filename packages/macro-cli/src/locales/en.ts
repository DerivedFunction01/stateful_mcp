import { EN_CORE } from "./en/core";
import { EN_SETTINGS_APPEARANCE } from "./en/settings-appearance";
import { EN_SETTINGS_CURRENCY } from "./en/settings-currency";
import { EN_SETTINGS_DATETIME } from "./en/settings-datetime";
import { EN_SETTINGS_EDITOR } from "./en/settings-editor";
import { EN_SETTINGS_FREQUENCY } from "./en/settings-frequency";
import { EN_SETTINGS_NUMERIC } from "./en/settings-numeric";
import { EN_SETTINGS_QUANTITY } from "./en/settings-quantity";
import { EN_SETTINGS_SYNTAX } from "./en/settings-syntax";

export const EN_LOCALE_CLI = {
	...EN_CORE,
	...EN_SETTINGS_SYNTAX,
	...EN_SETTINGS_NUMERIC,
	...EN_SETTINGS_DATETIME,
	...EN_SETTINGS_FREQUENCY,
	...EN_SETTINGS_QUANTITY,
	...EN_SETTINGS_CURRENCY,
	...EN_SETTINGS_APPEARANCE,
	...EN_SETTINGS_EDITOR,
} as const;

export type LocaleKey = keyof typeof EN_LOCALE_CLI;
