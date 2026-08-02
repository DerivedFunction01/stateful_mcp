import type { OwnerScope } from "../../../config/types";
import type {
	EffectiveStorePolicy,
	OperationStatus,
	PermissionDiagnostics,
} from "../../../storage/contracts";
import type { KvBackend } from "./kv-backend";

export class PermissionedSimpleKvBackend implements KvBackend {
	readonly diagnostics: PermissionDiagnostics = { suppressedCount: 0 };

	constructor(
		private readonly backend: KvBackend,
		private readonly policy: EffectiveStorePolicy = {},
	) {}

	async load(): Promise<void> {
		if (!this.readAllowed()) return;
		await this.backend.load();
	}
	async save(): Promise<void> {
		if (!this.writeAllowed()) return;
		await this.backend.save();
	}
	async getSessionState(sessionId: string, id: string) {
		return this.readAllowed()
			? this.backend.getSessionState(sessionId, id)
			: null;
	}
	async setSessionState(
		sessionId: string,
		id: string,
		value: Record<string, any>,
	): Promise<void> {
		if (this.writeAllowed())
			await this.backend.setSessionState(sessionId, id, value);
	}
	async deleteSessionState(sessionId: string, id: string): Promise<void> {
		if (this.deleteAllowed())
			await this.backend.deleteSessionState(sessionId, id);
	}
	listSessionIds(sessionId: string) {
		return this.readAllowed()
			? this.backend.listSessionIds(sessionId)
			: Promise.resolve([]);
	}
	scanSessionStates(sessionId: string) {
		return this.readAllowed()
			? this.backend.scanSessionStates(sessionId)
			: emptyAsync<Record<string, any>>();
	}
	async getPersistentState(id: string, scope: OwnerScope) {
		return this.readAllowed()
			? this.backend.getPersistentState(id, scope)
			: null;
	}
	async setPersistentState(
		id: string,
		scope: OwnerScope,
		value: Record<string, any>,
	): Promise<void> {
		if (this.writeAllowed())
			await this.backend.setPersistentState(id, scope, value);
	}
	async deletePersistentState(id: string, scope: OwnerScope): Promise<void> {
		if (this.deleteAllowed())
			await this.backend.deletePersistentState(id, scope);
	}
	scanPersistentStates(scope: OwnerScope, includeGlobal?: boolean) {
		return this.readAllowed()
			? this.backend.scanPersistentStates(scope, includeGlobal)
			: emptyAsync<Record<string, any>>();
	}
	getAlias(sessionId: string, alias: string) {
		return this.readAllowed()
			? this.backend.getAlias(sessionId, alias)
			: Promise.resolve(null);
	}
	async setAlias(
		sessionId: string,
		alias: string,
		targetId: string,
	): Promise<void> {
		if (this.writeAllowed())
			await this.backend.setAlias(sessionId, alias, targetId);
	}
	async deleteAlias(sessionId: string, alias: string): Promise<void> {
		if (this.deleteAllowed()) await this.backend.deleteAlias(sessionId, alias);
	}
	listAliases(sessionId: string) {
		return this.readAllowed()
			? this.backend.listAliases(sessionId)
			: Promise.resolve([]);
	}
	private readAllowed(): boolean {
		if (this.policy.permissions?.read === false)
			this.record("skipped_read_only", "read");
		return this.policy.permissions?.read !== false;
	}
	private writeAllowed(): boolean {
		if (this.policy.permissions?.write === false)
			this.record("skipped_read_only", "write");
		return this.policy.permissions?.write !== false;
	}
	private deleteAllowed(): boolean {
		if (this.policy.permissions?.delete === false)
			this.record("skipped_read_only", "delete");
		return this.policy.permissions?.delete !== false;
	}
	private record(
		status: OperationStatus,
		operation: "read" | "write" | "delete",
	): void {
		this.diagnostics.lastStatus = status;
		this.diagnostics.lastOperation = operation;
		this.diagnostics.suppressedCount++;
	}
}

async function* emptyAsync<T>(): AsyncIterable<T> {}
