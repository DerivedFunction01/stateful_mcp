export type MacroProjectBackendKind = "jsonl" | "sqlite";

export interface MacroProjectBackendDescriptor {
	readonly kind: MacroProjectBackendKind;
	readonly path: string;
}

export interface MacroProjectExtensionSpec {
	readonly id: string;
	readonly source: string;
	readonly version: string;
	readonly requires?: readonly string[];
}

export interface MacroProjectResourceReference {
	readonly resourceId: string;
	readonly kind: string;
	readonly revision?: string;
	readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface MacroProjectManifest {
	readonly formatVersion: number;
	readonly projectId: string;
	readonly displayName: string;
	readonly backend: MacroProjectBackendDescriptor;
	readonly defaultProfileId?: string;
	readonly activeProfileId?: string;
	readonly uiLocale?: string;
	readonly extensions: readonly MacroProjectExtensionSpec[];
	readonly extensionProfiles?: Readonly<Record<string, readonly string[]>>;
	readonly resources: readonly MacroProjectResourceReference[];
	readonly historyResources: readonly MacroProjectResourceReference[];
	readonly migration?: Readonly<Record<string, unknown>>;
}

export type MacroProjectLifecycle = "open" | "dirty" | "closed";

export interface MacroProjectDescriptor {
	readonly projectId: string;
	readonly displayName: string;
	readonly rootPath: string;
	readonly manifestPath: string;
	readonly backend: MacroProjectBackendDescriptor;
	readonly lifecycle: MacroProjectLifecycle;
	readonly revision: string;
	readonly resources: readonly MacroProjectResourceReference[];
	readonly historyResources: readonly MacroProjectResourceReference[];
}

export interface ProjectRevision {
	readonly revision: string;
}

export class MacroProjectConflictError extends Error {
	readonly code = "MACRO_PROJECT_REVISION_CONFLICT";

	constructor(
		message: string,
		readonly details: Readonly<Record<string, unknown>> = {},
	) {
		super(message);
		this.name = "MacroProjectConflictError";
	}
}

export class MacroProjectFormatError extends Error {
	readonly code = "MACRO_PROJECT_FORMAT_INVALID";
}

export interface ExtensionStorageScope {
	readonly scope: "project" | "global" | "content" | "cache";
	readonly extensionId: string;
}
