import type { ExtensionContext } from "../context/extension-context";

export interface MacroExtensionManifest {
	id: string;
	version: string;
	requires?: readonly string[];
}

export interface ExtensionActivation {
	exports?: Record<string, unknown>;
	dispose?(): Promise<void> | void;
}

export interface MacroExtension {
	manifest: MacroExtensionManifest;
	activate(context: ExtensionContext): Promise<ExtensionActivation> | ExtensionActivation;
}

export interface DefineExtensionOptions extends MacroExtensionManifest {
	activate(context: ExtensionContext): Promise<ExtensionActivation> | ExtensionActivation;
}

export function defineExtension(options: DefineExtensionOptions): MacroExtension {
	const { id, version, requires, activate } = options;
	if (!id || !version || typeof activate !== "function") {
		throw new Error("An extension requires an id, version, and activate function");
	}
	return {
		manifest: { id, version, ...(requires ? { requires: [...requires] } : {}) },
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
