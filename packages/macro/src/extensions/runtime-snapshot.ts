import type { ActiveExtension } from "./contracts";

export interface ExtensionRuntimeSnapshot {
	readonly id: string;
	readonly version: string;
	readonly sourceFile?: string;
	readonly state: "listed" | "imported" | "active" | "disabled" | "failed";
	readonly dependencies: readonly string[];
	readonly contributions: {
		readonly containers: readonly string[];
		readonly views: readonly string[];
		readonly tabs: readonly string[];
		readonly commands: readonly string[];
		readonly localizations: readonly string[];
		readonly settings?: readonly string[];
	};
	readonly diagnostics: readonly string[];
}

export function snapshotActiveExtension(
	extension: ActiveExtension,
	contributions: ExtensionRuntimeSnapshot["contributions"],
): ExtensionRuntimeSnapshot {
	return {
		id: extension.manifest.id,
		version: extension.manifest.version,
		sourceFile: extension.sourceFile,
		state: "active",
		dependencies: extension.manifest.requires ?? [],
		contributions,
		diagnostics: [],
	};
}
