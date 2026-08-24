import type { FSWatcher } from "node:fs";
import type {
	EditorKeymapProfile,
	MacroDocumentTemplate,
} from "@stateful-mcp/macro";
import type { SettingsBundlePayload } from "@stateful-mcp/macro/workspace/config/settings-service";
import type { LoadedMacroWorkspace } from "@stateful-mcp/macro-host";
import type {
	EditorOperationResult,
	HostEvent,
	SettingsScope,
	WorkspaceSnapshot,
} from "@stateful-mcp/macro-protocol";

/**
 * Options accepted when creating (or re-seeding) a host session. Mirrors the
 * shape that the host workspace loader understands and is kept here so the
 * lifecycle, registry, and event modules share a single source of truth.
 */
export interface HostSessionOptions {
	readonly workspacePath?: string;
	readonly profileId?: string;
	readonly locale?: string;
	readonly initialText?: string;
	readonly templates?: readonly MacroDocumentTemplate[];
	readonly keymap?: Partial<EditorKeymapProfile>;
}

/**
 * A settings bundle that has been staged for a later atomic apply.
 */
export interface StagedBundle {
	readonly stageId: string;
	readonly revision: string;
	readonly bundle: SettingsBundlePayload;
	readonly scope: SettingsScope;
	readonly profileId: string;
	readonly mode: "merge" | "replace";
}

/**
 * Mutable runtime record for a single host session. The session owns the
 * loaded workspace, its keymap, the set of subscribed event listeners, the
 * registered signal unsubscribers, sequence/revision counters used by event
 * emission, and the file-tree watcher bookkeeping.
 */
export interface Session {
	readonly id: string;
	readonly workspaceId: string;
	loaded: LoadedMacroWorkspace;
	keymap: EditorKeymapProfile;
	readonly listeners: Set<(event: HostEvent) => void>;
	readonly unsubs: (() => void)[];
	sequence: number;
	revision: number;
	lastActivity: number;
	disposed: boolean;
	fileTreeWatcher?: FSWatcher;
	fileTreeRefreshTimer?: ReturnType<typeof setTimeout>;
	fileTreeWatchers?: readonly FSWatcher[];
	stagedBundle?: StagedBundle;
}

/**
 * A function that produces the workspace snapshot emitted on every host event.
 * Supplied explicitly (rather than captured via `this`) so the event bus has
 * no hidden dependency on the surrounding manager.
 */
export type WorkspaceSnapshotProvider = (session: Session) => WorkspaceSnapshot;

/**
 * Resolves the on-disk project root for a session. Provided by the integrating
 * manager because path resolution depends on the manager's project-root policy.
 */
export type ProjectRootResolver = (session: Session) => string;

/**
 * Event listener attached to a session.
 */
export type SessionListener = (event: HostEvent) => void;

/**
 * Hooks used by the registry when tearing a session down. Kept explicit so the
 * registry only owns the `Map` and idle-timeout policy, while watcher shutdown,
 * unsubscription, listener cleanup, and async resource disposal live elsewhere.
 */
export interface SessionDisposalController {
	/** Synchronous cleanup: stop file-tree watchers, run unsubs, clear listeners. */
	teardown(session: Session): void;
	/** Asynchronous cleanup: release the underlying workspace resources. */
	disposeResources(session: Session): Promise<void>;
}

/**
 * Minimal registry surface shared by the lifecycle and event modules so they
 * do not depend on the concrete `SessionRegistry` class.
 */
export interface SessionRegistryLike {
	get(sessionId: string): Session | undefined;
	getOrError(sessionId: string): Session;
	has(sessionId: string): boolean;
	register(session: Session): void;
	delete(sessionId: string): void;
	ids(): string[];
}

/**
 * Minimal event-bus surface shared by the lifecycle and registry modules.
 */
export interface SessionEventBusLike {
	subscribe(session: Session, listener: SessionListener): () => void;
	emit(
		session: Session,
		type: HostEvent["type"],
		result?: EditorOperationResult,
		additionalPayload?: Record<string, unknown>,
	): void;
	attachSignals(session: Session): void;
}

/**
 * Aggregated collaborators required to drive session creation, project
 * opening, file-tree watching, and disposal. Constructed by the integrating
 * manager and threaded explicitly through every lifecycle helper.
 */
export interface SessionLifecycleContext {
	readonly host: import("@stateful-mcp/macro-host").MacroHost;
	readonly eventBus: SessionEventBusLike;
	readonly registry: SessionRegistryLike;
	readonly snapshotProvider: WorkspaceSnapshotProvider;
	readonly projectRootResolver: ProjectRootResolver;
	/** Optional default project root forwarded to the workspace loader. */
	readonly projectRoot?: string;
}

/** Event types emitted for a session, narrowed for callers. */
export type SessionEventType = HostEvent["type"];
