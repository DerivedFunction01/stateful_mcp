import type { ParsedItem } from "../parser/schema-parsers";
import type { PresentationItem } from "../presentation/field-types";
import { createParsedItemPresentation } from "../presentation/projector";
import type { QuantityFormatContext } from "../presentation/quantity-format";
import type { CodeableConcept, SoapSection } from "../schemas/shared";
import type {
	Cell,
	CellError,
	CellMode,
	CellRoutingScope,
	CellStatus,
} from "./cell";

export type InterpretationAvailability =
	| "available"
	| "unavailable"
	| "not-run";

export interface CellInterpretationSource {
	cellId: string;
	workspaceId?: string;
	mode?: CellMode;
	rawInput: string;
	routing: Cell["routing"];
	parsedOutput: Cell["parsedOutput"];
	interpretation?: Cell["interpretation"];
	status: CellStatus;
	errorMessage?: string;
	presentationContext?: QuantityFormatContext;
}

export interface CellInterpretationField {
	path: string;
	value: unknown;
	state: "resolved" | "unresolved";
}

export interface CellInterpretationItem {
	targetSchema: string;
	rawText: string;
	concepts: CodeableConcept[];
	fields: CellInterpretationField[];
	title?: string;
	presentation?: PresentationItem;
}

export interface CellInterpretationSummary {
	cellId: string;
	mode: CellMode | "workspace";
	status: CellStatus;
	rawInput: string;
	routing: {
		scope: CellRoutingScope;
		section: SoapSection | null;
		targetSchema: string | null;
		resolvedSchema: string | null;
		branchId?: string;
	};
	items: CellInterpretationItem[];
	diagnostics: {
		error?: {
			code?: CellError;
			message: string;
		};
		confidence:
			| {
					state: "available";
					level: "high" | "medium" | "low";
					score: number;
					breakdown?: import("../store/learning/interfaces").ParseConfidenceScoreBreakdown;
			  }
			| { state: "unavailable" };
		alternatives: "unavailable";
		validation: "not-run";
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function flattenFields(
	value: unknown,
	path: string,
	fields: CellInterpretationField[],
	ancestors: Set<object>,
): void {
	if (value === null || value === undefined || value === "") {
		fields.push({ path, value, state: "unresolved" });
		return;
	}

	if (Array.isArray(value)) {
		if (value.length === 0) {
			fields.push({ path, value: [], state: "unresolved" });
			return;
		}
		value.forEach((entry, index) =>
			flattenFields(entry, `${path}[${index}]`, fields, ancestors),
		);
		return;
	}

	if (isRecord(value)) {
		if (ancestors.has(value)) {
			fields.push({ path, value: "[circular]", state: "resolved" });
			return;
		}
		const nextAncestors = new Set(ancestors);
		nextAncestors.add(value);
		const entries = Object.entries(value);
		if (entries.length === 0) {
			fields.push({ path, value: {}, state: "unresolved" });
			return;
		}
		for (const [key, entry] of entries) {
			flattenFields(
				entry,
				path ? `${path}.${key}` : key,
				fields,
				nextAncestors,
			);
		}
		return;
	}

	fields.push({ path, value, state: "resolved" });
}

function summarizeParsedItem(
	item: ParsedItem,
	context?: QuantityFormatContext,
): CellInterpretationItem {
	const presentation = createParsedItemPresentation(item, context);
	const fields: CellInterpretationField[] = [];
	for (const [key, value] of Object.entries(item.extractedData ?? {})) {
		flattenFields(value, key, fields, new Set());
	}

	return {
		targetSchema: item.targetSchema,
		rawText: item.rawText,
		concepts: item.concept ?? [],
		fields,
		title: presentation.title,
		presentation,
	};
}

/**
 * Projects a cell into the intentionally small read model used by inspectors.
 * This function must remain presentation-safe: do not add context bags,
 * parser/store instances, or arbitrary metadata to this projection.
 */
export function createCellInterpretationSummary(
	cell: CellInterpretationSource,
): CellInterpretationSummary {
	return {
		cellId: cell.cellId,
		mode: cell.mode ?? (cell.workspaceId ? "workspace" : "cdsl"),
		status: cell.status,
		rawInput: cell.rawInput,
		routing: {
			scope: cell.routing.scope,
			section: cell.routing.resolvedSection ?? null,
			targetSchema: cell.routing.targetSchema,
			resolvedSchema: cell.routing.resolvedSchema ?? null,
			...(cell.routing.branchId ? { branchId: cell.routing.branchId } : {}),
		},
		items: (cell.parsedOutput ?? []).map((item) =>
			summarizeParsedItem(item, cell.presentationContext),
		),
		diagnostics: {
			error: cell.errorMessage ? { message: cell.errorMessage } : undefined,
			confidence: cell.interpretation?.confidence
				? {
						state: "available",
						level: cell.interpretation.confidence.level,
						score: cell.interpretation.confidence.score,
						breakdown: cell.interpretation.confidence.breakdown,
					}
				: { state: "unavailable" },
			alternatives: "unavailable",
			validation: "not-run",
		},
	};
}
