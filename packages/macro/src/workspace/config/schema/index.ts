import type { I18nKernel } from "../../i18n/i18n-kernel";
import type { SettingsSchemaEntry } from "../settings-service";
import { createAppearanceSchema } from "./appearance";
import { createApplicationSchema } from "./application";
import { createEditorSchema } from "./editor";
import { createFundamentalsSchema } from "./fundamentals";

export function createDefaultSettingsSchema(
	i18n?: I18nKernel,
): readonly SettingsSchemaEntry[] {
	return [
		...createFundamentalsSchema(i18n),
		...createEditorSchema(i18n),
		...createAppearanceSchema(i18n),
		...createApplicationSchema(i18n),
	];
}

export {
	createAppearanceSchema,
	createApplicationSchema,
	createEditorSchema,
	createFundamentalsSchema,
};
