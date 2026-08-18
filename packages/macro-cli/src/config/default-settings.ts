import type { I18nKernel, SettingsSchemaEntry } from "@stateful-mcp/macro";
import { createDefaultSettingsRegistry } from "./index";

const defaultRegistry = createDefaultSettingsRegistry();

export const DEFAULT_WORKSPACE_SETTINGS_VALUES = defaultRegistry.getDefaults();

export function getDefaultSettingsSchema(
	i18n?: I18nKernel,
): readonly SettingsSchemaEntry[] {
	return defaultRegistry.getSchema(i18n);
}
