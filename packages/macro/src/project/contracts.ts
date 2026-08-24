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
	readonly scratchpadResources?: readonly MacroProjectResourceReference[];
	readonly migration?: Readonly<Record<string, unknown>>;
	readonly templates?: readonly {
		readonly templateId: string;
		readonly title: string;
		readonly description?: string;
		readonly initialText?: string;
		readonly pinnedMacroIds?: readonly string[];
		readonly tags?: readonly string[];
	}[];
	/** Values explicitly opted into project sharing by an extension. */
	readonly projectSettings?: Readonly<
		Record<string, Readonly<Record<string, unknown>>>
	>;
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
	readonly scratchpadResources?: readonly MacroProjectResourceReference[];
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

/** Core-owned migration lifecycle. Extensions only transform their own data. */
export interface ProjectMigrationContext {
	readonly projectRoot: string;
	readonly sourceBackend: MacroProjectBackendDescriptor;
	readonly targetBackend: MacroProjectBackendDescriptor;
	readonly signal?: AbortSignal;
	readonly sourceHistory: import("@stateful-mcp/core").HistoryResourceStore;
	readonly sourceScratchpads: import("@stateful-mcp/core").ScratchpadResourceStore;
	readonly targetHistory: import("@stateful-mcp/core").HistoryResourceStore;
	readonly targetScratchpads: import("@stateful-mcp/core").ScratchpadResourceStore;
}

export interface ProjectMigrationParticipantPlan {
	readonly participantId: string;
	readonly extensionId: string;
	readonly resourceIds?: readonly string[];
	readonly status: "ready" | "missing" | "incompatible";
	readonly message?: string;
}

export interface ProjectMigrationParticipant {
	readonly id: string;
	readonly dependsOn?: readonly string[];
	readonly resourceIds?: readonly string[];
	plan?(
		context: ProjectMigrationContext,
	): Promise<ProjectMigrationParticipantPlan> | ProjectMigrationParticipantPlan;
	migrate?(context: ProjectMigrationContext): Promise<void> | void;
	verify?(context: ProjectMigrationContext): Promise<void> | void;
	rollback?(context: ProjectMigrationContext): Promise<void> | void;
}
