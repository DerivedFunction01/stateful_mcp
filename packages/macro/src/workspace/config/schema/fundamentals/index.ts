import type { I18nKernel } from "../../../i18n/i18n-kernel";
import type { SettingsSchemaEntry } from "../../settings-service";
import { createCurrencySchema } from "./currency";
import { createDateTimeSchema } from "./date-time";
import { createFrequencySchema } from "./frequency";
import { createNumericSchema } from "./numeric";
import { createQuantitySchema } from "./quantity";

export function createFundamentalsSchema(
	i18n?: I18nKernel,
): readonly SettingsSchemaEntry[] {
	return [
		...createCurrencySchema(i18n),
		...createDateTimeSchema(i18n),
		...createQuantitySchema(i18n),
		...createFrequencySchema(i18n),
		...createNumericSchema(i18n),
	];
}

export {
	createCurrencySchema,
	createDateTimeSchema,
	createFrequencySchema,
	createNumericSchema,
	createQuantitySchema,
};
