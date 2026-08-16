import type { ExtensionContext } from "../context/extension-context";
import type { MacroDefinitionAdapter } from "../contracts/composition";
import type { ExtensionDomainConfig } from "../contracts/extension-config";
import type { MacroExtensionUIContributions } from "../workspace/contributions/types";

export interface ExtensionLocaleBundle {
	readonly languageId: string;
	readonly dictionary: Record<string, string>;
}

export interface MacroExtensionManifest {
	id: string;
	version: string;
	requires?: readonly string[];
	configDefaults?: Readonly<Record<string, unknown>>;
	domainConfig?: ExtensionDomainConfig;
	contributes?: MacroExtensionUIContributions;
}

export interface ExtensionActivation {
	exports?: Record<string, unknown>;
	adapters?: readonly MacroDefinitionAdapter[];
	localizations?: readonly ExtensionLocaleBundle[];
	dispose?(): Promise<void> | void;
}

export interface MacroExtension {
	manifest: MacroExtensionManifest;
	activate(
		context: ExtensionContext,
	): Promise<ExtensionActivation> | ExtensionActivation;
}

export interface DefineExtensionOptions extends MacroExtensionManifest {
	activate(
		context: ExtensionContext,
	): Promise<ExtensionActivation> | ExtensionActivation;
}

export function defineExtension(
	options: DefineExtensionOptions,
): MacroExtension {
	const { id, version, requires, configDefaults, domainConfig, activate } =
		options;
	if (!id || !version || typeof activate !== "function") {
		throw new Error(
			"An extension requires an id, version, and activate function",
		);
	}
	return {
		manifest: {
			id,
			version,
			...(requires ? { requires: [...requires] } : {}),
			...(configDefaults ? { configDefaults } : {}),
			...(domainConfig ? { domainConfig } : {}),
		},
		activate,
	};
}

export interface LoadedExtension {
	extension: MacroExtension;
	sourceFile: string;
}

export interface ActiveExtension {
	manifest: MacroExtensionManifest;
	sourceFile: string;
	exports: Record<string, unknown>;
	dispose(): Promise<void>;
}
