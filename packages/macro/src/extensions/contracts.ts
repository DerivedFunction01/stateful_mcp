import type { ExtensionContext } from "../context/extension-context";
import type { MacroDefinitionAdapter } from "../contracts/composition";
import type { ExtensionDomainConfig } from "../contracts/extension-config";
import type {
	CommandHandler,
	ExtensionTabProvider,
	ExtensionViewProvider,
	MacroExtensionUIContributions,
} from "../workspace/contributions/types";

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
	contributions?: {
		readonly views?: Readonly<Record<string, ExtensionViewProvider>>;
		readonly tabs?: Readonly<Record<string, ExtensionTabProvider>>;
		readonly commands?: Readonly<Record<string, CommandHandler>>;
	};
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
	const {
		id,
		version,
		requires,
		configDefaults,
		domainConfig,
		contributes,
		activate,
	} = options;
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
			...(contributes ? { contributes } : {}),
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
	readonly contributions?: ExtensionActivation["contributions"];
	dispose(): Promise<void>;
}
