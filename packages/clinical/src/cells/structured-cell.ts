/**
 * V2 structured-cell contracts.
 *
 * The durable authored execution unit. This intentionally does NOT carry
 * `parsedOutput`, CDSL mode fields, parser confidence records, or untyped
 * parser learning fields. A UI/editor mode is not persisted as the domain
 * execution mode.
 */

import type { MergeStrategy } from "../values/merge";
import type { CellIntent } from "./cell-intent";
import type { CellResultRef } from "./cell-results";

/** V2-local collection reference (not the legacy session/cell collection). */
export interface V2CellCollectionRef {
	kind: "notebook" | "workspace" | (string & {});
	collectionId: string;
}

export type CellSourceOrigin =
	| "user"
	| "macro_generated"
	| "imported"
	| "system";

export type CellLifecycleStatus =
	| "draft"
	| "classified"
	| "preview"
	| "pending_commit"
	| "committed"
	| "failed"
	| "cancelled"
	| "deleted"
	| "locked";

export interface CellProvenance {
	sourceCellId?: string;
	parentCellId?: string;
	macroDefinitionId?: string;
	macroDefinitionVersion?: number;
	compatibilitySignature?: string;
}

export interface CellRelationships {
	supersedesCellId?: string;
	links?: CellLink[];
}

export interface CellLink {
	linkId: string;
	targetCellId: string;
	targetSchema: string;
	targetField: string;
	mergeStrategy: MergeStrategy;
}

export type CellDiagnosticSeverity = "info" | "warning" | "error";

export interface CellDiagnostic {
	code: string;
	severity: CellDiagnosticSeverity;
	message: string;
	path?: string;
}

export interface StructuredCell {
	cellId: string;
	sessionId: string;
	collection: V2CellCollectionRef;
	source: {
		origin: CellSourceOrigin;
		authorId?: string;
		createdAt: string;
		updatedAt: string;
	};
	authored: {
		rawText: string;
		intent?: CellIntent;
	};
	lifecycle: {
		status: CellLifecycleStatus;
		revision: number;
		lockedAt?: string;
	};
	execution: {
		previewId?: string;
		transactionId?: string;
		planFingerprint?: string;
		committedAt?: string;
		generatedCellIds?: string[];
		resultRefs?: CellResultRef[];
	};
	provenance: CellProvenance;
	relationships: CellRelationships;
	diagnostics: CellDiagnostic[];
}
