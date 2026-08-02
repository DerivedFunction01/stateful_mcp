import type {
	EffectiveStorePolicy,
	OperationStatus,
	PermissionDiagnostics,
	StorageOperation,
} from "../../../storage/contracts";

export class SqlPermissionPolicy {
	readonly diagnostics: PermissionDiagnostics = { suppressedCount: 0 };

	constructor(readonly policy: EffectiveStorePolicy = {}) {}

	allows(operation: StorageOperation): boolean {
		if (operation === "read" || operation === "syncRead") {
			return this.policy.permissions?.read !== false;
		}
		if (operation === "delete")
			return this.policy.permissions?.delete !== false;
		if (operation === "syncWrite")
			return this.policy.permissions?.syncWrite !== false;
		if (operation === "schema") {
			return (
				this.policy.schemaMode !== "read_only" &&
				this.policy.schemaMode !== "validate_only"
			);
		}
		return this.policy.permissions?.write !== false;
	}

	record(operation: StorageOperation, status: OperationStatus): void {
		this.diagnostics.lastOperation = operation;
		this.diagnostics.lastStatus = status;
		if (status !== "applied") this.diagnostics.suppressedCount++;
	}
}
