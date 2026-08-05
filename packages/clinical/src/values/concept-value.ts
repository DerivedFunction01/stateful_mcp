import type { ExpressionSearchRequest } from "@stateful-mcp/core/middleware/dictionary/interfaces";
import type {
	Concept,
	CustomExpression,
} from "@stateful-mcp/core/middleware/dictionary/types";
import type { CodeableConcept } from "../schemas/schemas-interface/shared";
import type { ConceptValue, ValueEvidence } from "./typed-value";

export interface ConceptLookup {
	search(
		query: string,
		namespaceCode?: string,
		limit?: number,
	): Promise<Concept[]>;
	searchExpressionCandidates?(
		request: ExpressionSearchRequest,
	): Promise<CustomExpression[]>;
}

export interface ConceptResolutionOptions {
	required?: boolean;
	allowedNamespaces?: readonly string[];
	targetAssignment?: string;
	limit?: number;
	evidence?: ValueEvidence[];
}

export interface ConceptResolutionDiagnostic {
	code: "concept_unresolved" | "concept_namespace_invalid";
	message: string;
}

export interface ConceptResolutionResult {
	value?: ConceptValue;
	diagnostics: ConceptResolutionDiagnostic[];
}

export async function resolveConceptValue(
	rawText: string,
	dictionary: ConceptLookup,
	options: ConceptResolutionOptions = {},
): Promise<ConceptResolutionResult> {
	const text = rawText.trim();
	const coordinate = parseCoordinate(text);
	let candidates = await dictionary.search(
		coordinate.code ?? text,
		coordinate.namespace,
		options.limit ?? 20,
	);
	let exact = candidates.find((candidate) =>
		coordinate.namespace
			? candidate.namespaceCode === coordinate.namespace &&
				candidate.standardCode === coordinate.code
			: candidate.display.toLowerCase() === text.toLowerCase() ||
				candidate.standardCode.toLowerCase() === text.toLowerCase(),
	);
	if (!exact && !coordinate.namespace && dictionary.searchExpressionCandidates) {
		const expressions = await dictionary.searchExpressionCandidates({
			lookupPrefix: text.toLocaleLowerCase(),
			targetAssignments: options.targetAssignment
				? [options.targetAssignment]
				: undefined,
			activeOnly: true,
			limit: options.limit ?? 20,
		});
		const expression = expressions.find(
			(candidate) =>
				(candidate.lookupTerm ?? candidate.term).toLocaleLowerCase() ===
					text.toLocaleLowerCase() ||
				candidate.term.toLocaleLowerCase() === text.toLocaleLowerCase(),
		);
		if (expression?.conceptId) {
			candidates = await dictionary.search(
				expression.term,
				undefined,
				options.limit ?? 20,
			);
			exact = candidates.find(
				(candidate) => candidate.id === expression.conceptId,
			);
		}
	}
	if (!exact || exact.active === false) {
		return {
			diagnostics:
				options.required === false
					? []
					: [
							{
								code: "concept_unresolved",
								message: `Concept '${rawText}' could not be resolved`,
							},
						],
		};
	}
	if (
		options.allowedNamespaces &&
		!options.allowedNamespaces.includes(exact.namespaceCode)
	) {
		return {
			diagnostics: [
				{
					code: "concept_namespace_invalid",
					message: `Concept '${rawText}' resolved to disallowed namespace '${exact.namespaceCode}'`,
				},
			],
		};
	}
	const concept: CodeableConcept = {
		conceptId: exact.id,
		display: exact.display,
	};
	return {
		value: { kind: "concept", concept, rawText, evidence: options.evidence },
		diagnostics: [],
	};
}

function parseCoordinate(value: string): { namespace?: string; code?: string } {
	const separator = value.indexOf("::");
	if (separator <= 0) return {};
	return {
		namespace: value.slice(0, separator),
		code: value.slice(separator + 2),
	};
}
