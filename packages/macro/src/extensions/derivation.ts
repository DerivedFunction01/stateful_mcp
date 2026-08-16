import type { ExtensionContext } from "../context/extension-context";
import type { MacroDefinitionAdapter } from "../contracts/composition";
import type { ExtensionDomainConfig } from "../contracts/extension-config";
import type { ExtensionActivation, MacroExtension } from "./contracts";
import { defineExtension } from "./contracts";

export interface ExtendExtensionOptions {
	readonly id: string;
	readonly version: string;
	/** Add or override macro adapters */
	readonly overrideAdapters?: readonly MacroDefinitionAdapter[];
	/** Add or override domain configurations (units, bounds, currencies, localization) */
	readonly domainConfigOverrides?: Partial<ExtensionDomainConfig>;
	/** Optional custom activation logic */
	readonly onActivate?: (context: ExtensionContext) => Promise<void> | void;
}

/**
 * Extends a base MacroExtension, allowing derived domain extensions to inherit base logic,
 * override or add specialized macro adapters, and overlay domain configurations.
 */
export function extendExtension(
	baseExtension: MacroExtension,
	options: ExtendExtensionOptions,
): MacroExtension {
	const baseDomainConfig = baseExtension.manifest.domainConfig;
	const mergedDomainConfig: ExtensionDomainConfig | undefined =
		baseDomainConfig || options.domainConfigOverrides
			? {
					id: options.id,
					version: options.version,
					...(baseDomainConfig ?? {}),
					...(options.domainConfigOverrides ?? {}),
				}
			: undefined;

	return defineExtension({
		id: options.id,
		version: options.version,
		requires: [
			baseExtension.manifest.id,
			...(baseExtension.manifest.requires ?? []),
		],
		configDefaults: {
			...(baseExtension.manifest.configDefaults ?? {}),
		},
		domainConfig: mergedDomainConfig,
		activate: async (
			context: ExtensionContext,
		): Promise<ExtensionActivation> => {
			// 1. Activate the base extension
			const baseActivation = await baseExtension.activate(context);

			// 2. Merge or replace macro adapters
			const baseAdapters = baseActivation.adapters ?? [];
			const overrideMap = new Map(
				(options.overrideAdapters ?? []).map((a) => [a.definition.name, a]),
			);

			const mergedAdapters = [
				...baseAdapters.filter((a) => !overrideMap.has(a.definition.name)),
				...(options.overrideAdapters ?? []),
			];

			// 3. Run derived activation lifecycle
			if (options.onActivate) {
				await options.onActivate(context);
			}

			return {
				...baseActivation,
				adapters: mergedAdapters,
			};
		},
	});
}
