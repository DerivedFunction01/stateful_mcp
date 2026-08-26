/**
 * Persisted project manifest shape version. Version 2 replaced the flat
 * legacy extension-profile fields with the rich
 * Extension Activation Group model (`extensionGroups`/`activeExtensionGroupId`).
 * Older manifests are rejected; there are no compatibility readers.
 */
export const MACRO_PROJECT_FORMAT_VERSION = 2 as const;
export type MacroProjectFormatVersion = typeof MACRO_PROJECT_FORMAT_VERSION;

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

export const PROJECT_EXTENSION_GROUP_SOURCES = [
	"project",
	"builtin",
	"extension",
] as const;

/**
 * Where an activation group came from. Only `project` groups are persisted in
 * the project manifest as editable groups; `builtin` and `extension` groups are
 * surfaced as read-only catalog entries and must be duplicated before editing.
 */
export type ProjectExtensionGroupSource =
	(typeof PROJECT_EXTENSION_GROUP_SOURCES)[number];

/**
 * A project-local Extension Activation Group: the set of declared extensions a
 * project explicitly activates. Distinct from Macro/language profiles, which
 * remain owned by workspace settings.
 *
 * Invariants:
 * - The manifest record key equals `id`.
 * - `id` is stable and is not rewritten by a display-name rename.
 * - `extensionIds` holds direct membership only; dependency closure is resolved
 *   at load time and never persisted as membership.
 * - `extensionIds` is deduplicated and deterministically ordered.
 */
export interface ProjectExtensionActivationGroup {
	readonly id: string;
	readonly displayName: string;
	readonly description?: string;
	readonly extensionIds: readonly string[];
	readonly source: ProjectExtensionGroupSource;
	readonly readOnly?: boolean;
}

export type ProjectExtensionActivationGroupMap = Readonly<
	Record<string, ProjectExtensionActivationGroup>
>;

export interface MacroProjectManifest {
	readonly formatVersion: number;
	readonly projectId: string;
	readonly displayName: string;
	readonly backend: MacroProjectBackendDescriptor;
	readonly activeExtensionGroupId?: string;
	readonly uiLocale?: string;
	readonly extensions: readonly MacroProjectExtensionSpec[];
	readonly extensionGroups?: ProjectExtensionActivationGroupMap;
	readonly resources: readonly MacroProjectResourceReference[];
	readonly historyResources: readonly MacroProjectResourceReference[];
	readonly scratchpadResources?: readonly MacroProjectResourceReference[];
	readonly migration?: Readonly<Record<string, unknown>>;
	readonly templates?: readonly {
		readonly templateId: string;
		readonly title: string;
		readonly description?: string;
		readonly initialText?: string;
		/**
		 * Per-cell hidden defaults for the template, keyed by 1-based line number.
		 */
		readonly cellDefaults?: readonly {
			readonly lineNumber: number;
			readonly defaultMacroId: string;
		}[];
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

import {
	type ErrorDescriptor,
	errorDescriptor,
	type JsonValue,
	type MessageParam,
	type StructuredError,
	structuredError,
} from "@stateful-mcp/macro-protocol";

export class MacroProjectConflictError extends Error {
	readonly code = "MACRO_PROJECT_REVISION_CONFLICT";
	readonly messageKey: string;
	readonly messageParams?: Readonly<Record<string, MessageParam>>;
	readonly safeDetails?: Readonly<Record<string, JsonValue>>;

	constructor(options: {
		readonly messageKey: string;
		readonly messageParams?: Readonly<Record<string, MessageParam>>;
		readonly safeDetails?: Readonly<Record<string, JsonValue>>;
	}) {
		super(options.messageKey);
		const descriptor: ErrorDescriptor = errorDescriptor(
			options.messageKey,
			options.messageParams,
		);
		this.messageKey = descriptor.messageKey;
		this.messageParams = descriptor.messageParams;
		this.safeDetails = options.safeDetails;
		this.name = "MacroProjectConflictError";
	}

	toHostError(): StructuredError {
		return structuredError({
			code: this.code,
			messageKey: this.messageKey,
			messageParams: this.messageParams,
			safeDetails: this.safeDetails,
		});
	}
}

export class MacroProjectFormatError extends Error {
	readonly messageKey: string;
	readonly messageParams?: Readonly<Record<string, MessageParam>>;

	constructor(options: {
		readonly messageKey: string;
		readonly messageParams?: Readonly<Record<string, MessageParam>>;
		readonly cause?: unknown;
	}) {
		super(options.messageKey, { cause: options.cause });
		const descriptor: ErrorDescriptor = errorDescriptor(
			options.messageKey,
			options.messageParams,
		);
		this.messageKey = descriptor.messageKey;
		this.messageParams = descriptor.messageParams;
		this.name = "MacroProjectFormatError";
	}

	toHostError(): StructuredError {
		return structuredError({
			messageKey: this.messageKey,
			messageParams: this.messageParams,
		});
	}
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
	readonly sourceScratchpads: import("../scratchpad/contracts").ScratchpadResourceStore;
	/**
	 * Target stores exist only once the migration has been applied. The host
	 * boundary cannot open a real target store while merely planning, so it
	 * passes `undefined` for the plan context and the concrete project store
	 * supplies the real target stores when it applies the migration.
	 */
	readonly targetHistory?: import("@stateful-mcp/core").HistoryResourceStore;
	readonly targetScratchpads?: import("../scratchpad/contracts").ScratchpadResourceStore;
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
