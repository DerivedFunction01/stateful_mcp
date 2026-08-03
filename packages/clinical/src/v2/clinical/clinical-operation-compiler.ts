import type { MacroTargetOperation } from "../macros/macro-plan";
import {
	applyMerge,
	type ClinicalWritePolicy,
	type MergeStrategy,
	writePolicyToMergeStrategy,
} from "../values/merge";
import type { ClinicalEvent } from "./clinical-event-types";
import type { ClinicalOperation } from "./clinical-operation";
import type { ClinicalSchemaAdapterRegistry } from "./clinical-schema-adapter";

export interface MacroTargetCompileOptions {
	schemaVersion?: number;
	/** Macro-bar execution-mode policy (default) for groups lacking an override. */
	writePolicy?: ClinicalWritePolicy;
	/** Current document record values keyed by stable record ID, if known. */
	existing?: Readonly<
		Record<string, { values?: Record<string, unknown> } | undefined>
	>;
}

export class ClinicalOperationCompiler {
	constructor(private readonly schemas: ClinicalSchemaAdapterRegistry) {}

	compile(operation: ClinicalOperation): ClinicalEvent {
		switch (operation.kind) {
			case "document_initialized":
				return {
					kind: "clinical_document_initialized",
					documentId: operation.documentId,
					sessionId: operation.sessionId,
					patientId: operation.patientId,
					initialState: operation.initialState,
				};
			case "record_upserted": {
				const adapter = this.schemas.get(
					operation.schemaName,
					operation.schemaVersion,
				);
				const validation = adapter.validateRecord(operation.values, "upsert");
				if (!validation.valid)
					throw new Error(validation.diagnostics.join("; "));
				return {
					kind: "clinical_record_upserted",
					documentId: operation.documentId,
					schemaName: operation.schemaName,
					schemaVersion: operation.schemaVersion,
					recordId: operation.recordId,
					values: adapter.normalizeRecord
						? adapter.normalizeRecord(operation.values)
						: operation.values,
					provenance: operation.provenance,
				};
			}
			case "record_patched": {
				const adapter = this.schemas.get(
					operation.schemaName,
					operation.schemaVersion,
				);
				const validation = adapter.validateRecord(operation.changes, "patch");
				if (!validation.valid)
					throw new Error(validation.diagnostics.join("; "));
				return {
					kind: "clinical_record_patched",
					documentId: operation.documentId,
					schemaName: operation.schemaName,
					schemaVersion: operation.schemaVersion,
					recordId: operation.recordId,
					changes: adapter.normalizeRecord
						? adapter.normalizeRecord(operation.changes)
						: operation.changes,
					provenance: operation.provenance,
				};
			}
			case "record_removed":
				this.schemas.get(operation.schemaName, operation.schemaVersion);
				return {
					kind: "clinical_record_removed",
					documentId: operation.documentId,
					schemaName: operation.schemaName,
					schemaVersion: operation.schemaVersion,
					recordId: operation.recordId,
					reason: operation.reason,
					provenance: operation.provenance,
				};
			case "document_signed":
				return {
					kind: "clinical_document_signed",
					documentId: operation.documentId,
					signedBy: operation.signedBy,
					signedAt: operation.signedAt,
					provenance: operation.provenance,
				};
			case "document_amended":
				return {
					kind: "clinical_document_amended",
					documentId: operation.documentId,
					amendmentNote: operation.amendmentNote,
					provenance: operation.provenance,
				};
			case "document_voided":
				return {
					kind: "clinical_document_voided",
					documentId: operation.documentId,
					reason: operation.reason,
					provenance: operation.provenance,
				};
		}
	}

	/**
	 * Compile macro target operations into schema-agnostic clinical operations.
	 *
	 * Groups operations by their stable logical record ID (`operationId`) and
	 * chooses `record_upserted` when the record does not yet exist, otherwise
	 * `record_patched`. Multiple operations on the same record are merged using
	 * the effective write policy.
	 */
	compileMacroTargets(
		documentId: string,
		operations: readonly MacroTargetOperation[],
		options: MacroTargetCompileOptions = {},
	): ClinicalOperation[] {
		const schemaVersion = options.schemaVersion ?? 1;
		const groups = new Map<string, MacroTargetOperation[]>();
		for (const operation of operations) {
			const group = groups.get(operation.operationId) ?? [];
			group.push(operation);
			groups.set(operation.operationId, group);
		}
		const compiled: ClinicalOperation[] = [];
		for (const [recordId, group] of groups) {
			const first = group[0]!;
			const schemaName = first.targetSchema;
			const strategy = this.effectiveStrategy(group, options.writePolicy);
			const merged = this.mergeGroup(group, strategy);
			const existing = options.existing?.[recordId];
			compiled.push(
				existing && existing.values
					? this.patchOperation(
							documentId,
							schemaName,
							schemaVersion,
							recordId,
							merged,
							first,
						)
					: this.upsertOperation(
							documentId,
							schemaName,
							schemaVersion,
							recordId,
							merged,
							first,
						),
			);
		}
		return compiled;
	}

	private effectiveStrategy(
		group: readonly MacroTargetOperation[],
		planPolicy?: ClinicalWritePolicy,
	): MergeStrategy {
		const overrides = group
			.map((operation) => operation.writePolicy)
			.filter((policy): policy is ClinicalWritePolicy => Boolean(policy));
		const policy = overrides[0] ?? planPolicy ?? "upsert";
		return writePolicyToMergeStrategy(policy);
	}

	private mergeGroup(
		group: readonly MacroTargetOperation[],
		strategy: MergeStrategy,
	): Record<string, unknown> {
		const merged: Record<string, unknown> = {};
		for (const operation of group) {
			const parts = operation.targetPath.split(".").filter(Boolean);
			if (!parts.length) continue;
			let node = merged;
			for (let index = 0; index < parts.length - 1; index += 1) {
				const key = parts[index]!;
				if (
					typeof node[key] !== "object" ||
					node[key] === null ||
					Array.isArray(node[key])
				)
					node[key] = {};
				node = node[key] as Record<string, unknown>;
			}
			const leaf = parts[parts.length - 1]!;
			node[leaf] = applyMerge(node[leaf], operation.value, strategy);
		}
		return merged;
	}

	private upsertOperation(
		documentId: string,
		schemaName: string,
		schemaVersion: number,
		recordId: string,
		values: Record<string, unknown>,
		operation: MacroTargetOperation,
	): ClinicalOperation {
		return {
			kind: "record_upserted",
			documentId,
			schemaName,
			schemaVersion,
			recordId,
			values,
			provenance: {
				operationId: operation.operationId,
				sourceCellId: operation.cellRef,
				sourcePath: operation.targetPath,
				sourceMacroId: operation.macroDefinitionId ?? operation.groupId,
			},
		};
	}

	private patchOperation(
		documentId: string,
		schemaName: string,
		schemaVersion: number,
		recordId: string,
		changes: Record<string, unknown>,
		operation: MacroTargetOperation,
	): ClinicalOperation {
		return {
			kind: "record_patched",
			documentId,
			schemaName,
			schemaVersion,
			recordId,
			changes,
			provenance: {
				operationId: operation.operationId,
				sourceCellId: operation.cellRef,
				sourcePath: operation.targetPath,
				sourceMacroId: operation.macroDefinitionId ?? operation.groupId,
			},
		};
	}
}
