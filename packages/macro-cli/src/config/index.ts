import type {
	I18nKernel,
	SettingsSchemaEntry,
	SettingsSemanticProvider,
} from "@stateful-mcp/macro";
import { DEFAULT_SETTINGS_SEMANTIC_PROVIDERS } from "@stateful-mcp/macro";
import { appearanceSettingsModule } from "./modules/appearance.settings";
import { currencySettingsModule } from "./modules/currency.settings";
import { dateTimeSettingsModule } from "./modules/date-time.settings";
import { editorSettingsModule } from "./modules/editor.settings";
import { frequencySettingsModule } from "./modules/frequency.settings";
import { numericSettingsModule } from "./modules/numeric.settings";
import { quantitySettingsModule } from "./modules/quantity.settings";
import { syntaxSettingsModule } from "./modules/syntax.settings";
import { CompositeSettingsRegistry } from "./registry";

export * from "./modules/appearance.settings";
export * from "./modules/currency.settings";
export * from "./modules/date-time.settings";
export * from "./modules/editor.settings";
export * from "./modules/frequency.settings";
export * from "./modules/numeric.settings";
export * from "./modules/quantity.settings";
export * from "./modules/syntax.settings";
export * from "./registry";

export function createDefaultSettingsRegistry(): CompositeSettingsRegistry {
	return new CompositeSettingsRegistry()
		.register(syntaxSettingsModule)
		.register(numericSettingsModule)
		.register(dateTimeSettingsModule)
		.register(frequencySettingsModule)
		.register(quantitySettingsModule)
		.register(currencySettingsModule)
		.register(appearanceSettingsModule)
		.register(editorSettingsModule);
}

const defaultRegistry = createDefaultSettingsRegistry();

export const DEFAULT_WORKSPACE_SETTINGS_VALUES = defaultRegistry.getDefaults();

export function getDefaultSettingsSchema(
	i18n?: I18nKernel,
): readonly SettingsSchemaEntry[] {
	return defaultRegistry.getSchema(i18n);
}

export function getDefaultSettingsSemanticProviders(): readonly SettingsSemanticProvider[] {
	return DEFAULT_SETTINGS_SEMANTIC_PROVIDERS;
}
