import { useSyncExternalStore } from "react";
import type {
	HostEvent,
	HostError,
	WorkspaceSnapshot,
} from "@stateful-mcp/macro-protocol";
import { HostRequestError, type HostClient, type TransportState } from "./host-client";

export interface BrowserWorkspaceState {
	readonly status: TransportState | "loading";
	readonly snapshot?: WorkspaceSnapshot;
	readonly lastSequence: number;
	readonly lastRevision: number;
	readonly lastProjectRevision?: string;
	readonly protocolError?: HostError;
	readonly transportError?: string;
}

const initialState: BrowserWorkspaceState = {
	status: "loading",
	lastSequence: 0,
	lastRevision: 0,
};

export class BrowserWorkspaceStore {
	private state: BrowserWorkspaceState = initialState;
	private readonly listeners = new Set<() => void>();
	private stopEvent?: () => void;
	private stopTransport?: () => void;
	private startPromise?: Promise<void>;

	constructor(private readonly client: HostClient) {}

	getSnapshot = (): BrowserWorkspaceState => this.state;

	subscribe = (listener: () => void): (() => void) => {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	};

	start(): Promise<void> {
		if (this.startPromise) return this.startPromise;
		this.stopEvent = this.client.subscribe((event) => this.applyEvent(event));
		this.stopTransport = this.client.subscribeState((status) => {
			this.update({ status });
		});
		this.startPromise = this.client
			.createSession()
			.then((snapshot) => this.installSnapshot(snapshot))
			.catch((error: unknown) => {
				this.update({
					status: "error",
					protocolError: error instanceof HostRequestError ? error.error : undefined,
					transportError: error instanceof Error ? error.message : String(error),
				});
				throw error;
			});
		return this.startPromise;
	}

	async refresh(): Promise<void> {
		this.update({ status: "reconnecting" });
		const snapshot = await this.client.getSnapshot();
		this.installSnapshot(snapshot);
	}

	async executeCommand(
		command: string,
		args: readonly unknown[] = [],
	): Promise<unknown> {
		const result = await this.client.executeCommand(
			command,
			args,
			this.state.lastRevision,
		);
		const snapshot = this.client.getCachedSnapshot?.();
		if (snapshot) this.applyResponse(snapshot);
		return result;
	}

	async applySettings(
		operation: Parameters<HostClient["applySettings"]>[0],
	): Promise<WorkspaceSnapshot> {
		const snapshot = await this.client.applySettings(operation);
		this.applyResponse(snapshot);
		return snapshot;
	}

	async parse(text: string, textRevision: number): Promise<WorkspaceSnapshot> {
		const snapshot = await this.client.parse(text, textRevision);
		this.applyResponse(snapshot);
		return snapshot;
	}

	dispose(): void {
		this.stopEvent?.();
		this.stopTransport?.();
		this.stopEvent = undefined;
		this.stopTransport = undefined;
		this.startPromise = undefined;
		this.client.dispose?.();
	}

	private installSnapshot(snapshot: WorkspaceSnapshot): void {
		this.update({
			status: "connected",
			snapshot,
			lastSequence: 0,
			lastRevision: snapshot.revision,
			lastProjectRevision: snapshot.project?.revision,
			transportError: undefined,
		});
	}

	private applyResponse(snapshot: WorkspaceSnapshot): void {
		if (snapshot.revision < this.state.lastRevision) return;
		this.update({
			status: "connected",
			snapshot,
			lastRevision: snapshot.revision,
			lastProjectRevision: snapshot.project?.revision,
			transportError: undefined,
		});
	}

	private applyEvent(event: HostEvent): void {
		if (event.sessionId !== this.client.getSessionId()) return;
		const snapshot = (event.payload as { snapshot?: WorkspaceSnapshot }).snapshot;
		if (!snapshot) return;
		if (snapshot.revision < this.state.lastRevision) return;
		if (event.sequence !== 0 && event.sequence <= this.state.lastSequence) return;

		// Events carry complete snapshots. If a sequence gap occurs, the snapshot
		// is a safe resynchronization point; there is no browser patch log to replay.
		this.update({
			status: "connected",
			snapshot,
			lastSequence: event.sequence,
			lastRevision: snapshot.revision,
			lastProjectRevision: snapshot.project?.revision,
			transportError: undefined,
		});
	}

	private update(next: Partial<BrowserWorkspaceState>): void {
		this.state = { ...this.state, ...next };
		for (const listener of this.listeners) listener();
	}
}

export function useBrowserWorkspaceStore(
	store: BrowserWorkspaceStore,
): BrowserWorkspaceState {
	return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}
