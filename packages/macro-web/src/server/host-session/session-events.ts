import { randomUUID } from "node:crypto";
import type {
	EditorOperationResult,
	HostEvent,
	HostEventType,
} from "@stateful-mcp/macro-protocol";
import { MACRO_PROTOCOL_VERSION } from "@stateful-mcp/macro-protocol";
import type {
	Session,
	SessionListener,
	WorkspaceSnapshotProvider,
} from "./session-types";

/**
 * Broadcasts host events to the listeners subscribed on a session.
 *
 * The bus is intentionally decoupled from the session `Map` and the lifecycle:
 * it only knows how to (a) register/unregister listeners on a `Session`, (b)
 * build events from a supplied `WorkspaceSnapshotProvider`, and (c) attach the
 * workspace signal sources that drive `workspace.changed` emissions.
 */
export class SessionEventBus {
	private readonly snapshotProvider: WorkspaceSnapshotProvider;

	constructor(options: {
		readonly snapshotProvider: WorkspaceSnapshotProvider;
	}) {
		this.snapshotProvider = options.snapshotProvider;
	}

	/** Register a listener and return an unsubscribe function. */
	subscribe(session: Session, listener: SessionListener): () => void {
		session.listeners.add(listener);
		return () => session.listeners.delete(listener);
	}

	/**
	 * Wire every subscribable workspace signal source to a `workspace.changed`
	 * emission. Each source that exposes a `subscribe` method is observed; its
	 * teardown handle is pushed onto `session.unsubs` so `dispose` can cancel it.
	 */
	attachSignals(session: Session): void {
		const workspace = session.loaded.workspace;
		const signalSources: readonly unknown[] = [
			workspace.settings,
			workspace.layout,
			workspace.commands,
			workspace.tabs,
			workspace.views,
			workspace.i18n,
			workspace.editorGroups,
			workspace.journal,
		];
		for (const source of signalSources) {
			if (isSignalSource(source)) {
				session.unsubs.push(
					source.subscribe(() => this.emit(session, "workspace.changed")),
				);
			}
		}
	}

	/**
	 * Build and dispatch a host event for `session`. The sequence and revision
	 * counters advance on every emission; the workspace snapshot is captured
	 * through the injected provider. A disposed session never emits.
	 */
	emit(
		session: Session,
		type: HostEventType,
		result?: EditorOperationResult,
		additionalPayload?: Record<string, unknown>,
	): void {
		if (session.disposed) return;
		session.sequence += 1;
		session.revision += 1;
		const snapshot = this.snapshotProvider(session);
		const eventResult = result
			? {
					...result,
					snapshot: snapshot.editor,
					workspaceSnapshot: snapshot,
					workspaceRevision: session.revision,
				}
			: undefined;
		const event: HostEvent = {
			version: MACRO_PROTOCOL_VERSION,
			eventId: randomUUID(),
			type,
			sessionId: session.id,
			sequence: session.sequence,
			revision: session.revision,
			payload: {
				snapshot,
				...additionalPayload,
				...(eventResult ? { result: eventResult } : {}),
			},
		};
		for (const listener of session.listeners) listener(event);
	}
}

interface SignalSource {
	subscribe(listener: () => void): () => void;
}

function isSignalSource(value: unknown): value is SignalSource {
	return (
		typeof value === "object" &&
		value !== null &&
		"subscribe" in value &&
		typeof (value as { subscribe?: unknown }).subscribe === "function"
	);
}
