import type {
	ExpressionBackend,
	ExpressionCandidate,
	ExpressionSearchRequest,
} from "../contracts/backends";
import type { ExpressionSeed, ResourceDiagnostic } from "./contracts";
import { escapeSeedRegex, normalizeLookupTerm } from "./dictionary-seed";

export interface IndexedExpression {
	id: string;
	term: string;
	lookupTerm: string;
	regexPattern: string;
	isCaseInsensitive: boolean;
	conceptId?: string;
	canonicalValue: unknown;
	priorityWeight: number;
	active: boolean;
	metadata?: Record<string, unknown>;
}

export class ExpressionIndex implements ExpressionBackend {
	private expressions: IndexedExpression[] = [];
	private diagnostics: ResourceDiagnostic[] = [];

	rebuild(records: readonly IndexedExpression[]): readonly ResourceDiagnostic[] {
		this.expressions = [];
		this.diagnostics = [];
		for (const record of records) {
			if (!record.active) continue;
			try {
				new RegExp(record.regexPattern, record.isCaseInsensitive ? "i" : "");
			} catch (error) {
				this.diagnostics.push({
					code: "INVALID_EXPRESSION_REGEX",
					message: `Expression '${record.id}' has an invalid regex: ${error instanceof Error ? error.message : String(error)}`,
					recordType: "expression",
					recordId: record.id,
					severity: "error",
				});
				continue;
			}
			this.expressions.push({ ...record, lookupTerm: normalizeLookupTerm(record.lookupTerm) });
		}
		this.expressions.sort(compareExpressions);
		return this.diagnostics;
	}

	search(request: ExpressionSearchRequest): readonly ExpressionCandidate[] {
		const candidates: ExpressionCandidate[] = [];
		for (const expression of this.expressions) {
			const flags = expression.isCaseInsensitive ? "gi" : "g";
			let regex: RegExp;
			try {
				regex = new RegExp(expression.regexPattern, flags);
			} catch {
				continue;
			}
			for (const match of execAll(regex, request.text)) {
				const start = match.index;
				const end = start + match[0].length;
				if (end <= start || !hasWordBoundaries(request.text, start, end)) continue;
				candidates.push(candidate(expression, request.text, start, end, "exact"));
			}

			for (const alias of new Set([expression.term, expression.lookupTerm])) {
				const normalizedAlias = normalizeForExpression(alias, expression.isCaseInsensitive);
				if (!normalizedAlias) continue;
				for (const start of boundaryStarts(request.text)) {
					const partial = request.text.slice(start).trimEnd();
					const normalizedPartial = normalizeForExpression(partial, expression.isCaseInsensitive);
					if (!normalizedPartial || normalizedPartial.length >= normalizedAlias.length) continue;
					if (startsWith(normalizedPartial, normalizedAlias)) {
						candidates.push(candidate(expression, request.text, start, request.text.length, "prefix"));
					}
				}
			}
		}
		return candidates.sort(compareCandidates);
	}

	getDiagnostics(): readonly ResourceDiagnostic[] {
		return this.diagnostics;
	}
}

export function indexedExpressionFromSeed(seed: ExpressionSeed): IndexedExpression {
	return {
		id: seed.id,
		term: seed.term,
		lookupTerm: normalizeLookupTerm(seed.lookupTerm ?? seed.term),
		regexPattern: seed.regexPattern ?? escapeSeedRegex(seed.term),
		isCaseInsensitive: seed.isCaseInsensitive ?? false,
		conceptId: seed.conceptId,
		canonicalValue: seed.canonicalValue,
		priorityWeight: seed.priorityWeight ?? 0,
		active: seed.active !== false,
		metadata: seed.metadata,
	};
}

function candidate(
	expression: IndexedExpression,
	text: string,
	start: number,
	end: number,
	matchKind: "exact" | "prefix",
): ExpressionCandidate {
	return {
		id: expression.id,
		term: text.slice(start, end),
		start,
		end,
		matchKind,
		priority: expression.priorityWeight,
		canonicalValue: expression.canonicalValue ?? expression.conceptId,
		conceptId: expression.conceptId,
		metadata: expression.metadata,
	};
}

function compareExpressions(left: IndexedExpression, right: IndexedExpression): number {
	return right.priorityWeight - left.priorityWeight || left.id.localeCompare(right.id);
}

function compareCandidates(left: ExpressionCandidate, right: ExpressionCandidate): number {
	return (right.priority ?? 0) - (left.priority ?? 0) ||
		(right.end - right.start) - (left.end - left.start) ||
		left.start - right.start || left.id.localeCompare(right.id);
}

function execAll(expression: RegExp, text: string): RegExpExecArray[] {
	const matches: RegExpExecArray[] = [];
	let match = expression.exec(text);
	while (match) {
		matches.push(match);
		if (match[0].length === 0) expression.lastIndex += 1;
		match = expression.exec(text);
	}
	return matches;
}

function boundaryStarts(text: string): number[] {
	const starts = [0];
	for (let index = 1; index < text.length; index += 1) {
		if (/\s/u.test(text[index - 1]!)) starts.push(index);
	}
	return starts;
}

function hasWordBoundaries(text: string, start: number, end: number): boolean {
	return (start === 0 || /\s/u.test(text[start - 1]!)) &&
		(end === text.length || /\s/u.test(text[end]!));
}

function startsWith(value: string, prefix: string): boolean {
	return value === prefix.slice(0, value.length);
}

function normalizeForExpression(value: string, insensitive: boolean): string {
	const normalized = value.normalize("NFKC").trim().replace(/\s+/g, " ");
	return insensitive ? normalizeLookupTerm(normalized) : normalized;
}
