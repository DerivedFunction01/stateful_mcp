import type {
	EffectiveStorePolicy,
	OperationStatus,
	PermissionDiagnostics,
} from "../../../../storage/contracts";
import type { KvBackend } from "./KvBackend";

export class PermissionedKvBackend implements KvBackend {
	readonly diagnostics: PermissionDiagnostics = { suppressedCount: 0 };

	constructor(
		private readonly backend: KvBackend,
		private readonly policy: EffectiveStorePolicy = {},
	) {}

	async load(): Promise<Record<string, unknown>> {
		if (this.policy.permissions?.read === false) {
			this.record("skipped_read_only", "read");
			return {};
		}
		this.record("applied", "read");
		return this.backend.load();
	}

	async set(key: string, value: unknown): Promise<void> {
		if (this.policy.permissions?.write === false) {
			this.record("skipped_read_only", "write");
			return;
		}
		this.record("applied", "write");
		await this.backend.set(key, value);
	}

	async delete(key: string): Promise<void> {
		if (this.policy.permissions?.delete === false) {
			this.record("skipped_read_only", "delete");
			return;
		}
		this.record("applied", "delete");
		await this.backend.delete(key);
	}

	async save(): Promise<void> {
		if (this.policy.permissions?.write === false) {
			this.record("skipped_read_only", "write");
			return;
		}
		this.record("applied", "write");
		await this.backend.save();
	}

	private record(
		status: OperationStatus,
		operation: "read" | "write" | "delete",
	): void {
		this.diagnostics.lastStatus = status;
		this.diagnostics.lastOperation = operation;
		if (status !== "applied") this.diagnostics.suppressedCount++;
	}
}
