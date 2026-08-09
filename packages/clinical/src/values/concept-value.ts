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
		roleName?: string,
	): Promise<Concept[]>;
	searchExpressionCandidates?(
		request: ExpressionSearchRequest,
	): Promise<CustomExpression[]>;
}

export interface ConceptResolutionOptions {
	required?: boolean;
	allowedNamespaces?: readonly string[];
	roleName?: string;
	limit?: number;
	evidence?: ValueEvidence[];
}

export interface ConceptResolutionDiagnostic {
	code:
		| "concept_unresolved"
		| "concept_ambiguous"
		| "concept_namespace_invalid";
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
		options.roleName,
	);
	const exactMatches = candidates.filter((candidate) =>
		coordinate.namespace
			? candidate.namespaceCode === coordinate.namespace &&
				candidate.standardCode === coordinate.code
			: candidate.display.toLowerCase() === text.toLowerCase() ||
				candidate.standardCode.toLowerCase() === text.toLowerCase(),
	);
	if (exactMatches.length > 1) {
		return {
			diagnostics: [
				{
					code: "concept_ambiguous",
					message: `Concept '${rawText}' matched multiple concepts`,
				},
			],
		};
	}
	let exact = exactMatches[0];
	if (
		!exact &&
		!coordinate.namespace &&
		dictionary.searchExpressionCandidates
	) {
		const normalizedText = text.toLocaleLowerCase();
		const expressions = await dictionary.searchExpressionCandidates({
			lookupPrefix: normalizedText.split(/\s+/)[0] ?? normalizedText,
			roleName: options.roleName,
			activeOnly: true,
			limit: options.limit ?? 20,
		});
		const expressionMatches = expressions
			.filter((candidate) => {
				const term = (
					candidate.lookupTerm ?? candidate.term
				).toLocaleLowerCase();
				return normalizedText === term || normalizedText.startsWith(`${term} `);
			})
			.sort(
				(left, right) =>
					(right.lookupTerm ?? right.term).length -
					(left.lookupTerm ?? left.term).length,
			);
		const hasLongerExpression = expressions.some((candidate) => {
			const term = (candidate.lookupTerm ?? candidate.term).toLocaleLowerCase();
			return term.startsWith(`${normalizedText} `);
		});
		const expression = hasLongerExpression
			? undefined
			: selectUnambiguousExpression(expressionMatches);
		if (!expression && !hasLongerExpression && expressionMatches.length > 0) {
			return {
				diagnostics: [
					{
						code: "concept_ambiguous",
						message: `Concept '${rawText}' matched multiple expressions`,
					},
				],
			};
		}
		if (expression?.conceptId) {
			candidates = await dictionary.search(
						expression.term,
						undefined,
						options.limit ?? 20,
						options.roleName,
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

function selectUnambiguousExpression(
	expressions: readonly CustomExpression[],
): CustomExpression | undefined {
	if (expressions.length === 0) return undefined;
	const longestLength = Math.max(
		...expressions.map((expression) =>
			(expression.lookupTerm ?? expression.term).length,
		),
	);
	const longest = expressions.filter(
		(expression) =>
			(expression.lookupTerm ?? expression.term).length === longestLength,
	);
	return new Set(longest.map((expression) => expression.conceptId)).size > 1
		? undefined
		: longest[0];
}

function parseCoordinate(value: string): { namespace?: string; code?: string } {
	const separator = value.indexOf("::");
	if (separator <= 0) return {};
	return {
		namespace: value.slice(0, separator),
		code: value.slice(separator + 2),
	};
}
