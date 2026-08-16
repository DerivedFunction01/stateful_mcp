import type {
	ExpressionBackend,
	ExpressionCandidate,
	ExpressionSearchRequest,
} from "../contracts/backends";
import type { LocalizationPolicyConfig } from "../contracts/extension-config";
import { UniversalWordSegmenter } from "../values/localization";
import type {
	ExpressionSeed,
	ResourceDiagnostic,
	ResourceIdentity,
} from "./contracts";
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
	private segmenter = new UniversalWordSegmenter();
	ownerExtensionId?: string;
	resourceId?: string;
	resolverId?: string;
	version: string | number = 1;

	constructor(localization?: LocalizationPolicyConfig) {
		if (localization) {
			this.configureLocalization(localization);
		}
	}

	configureLocalization(localization?: LocalizationPolicyConfig): void {
		this.segmenter = new UniversalWordSegmenter(
			localization?.locale,
			localization?.boundaryPolicy ?? "standard",
			localization?.customBoundaryRegex,
		);
	}

	get backendVersion(): string | number {
		return this.version;
	}

	get identity(): ResourceIdentity | undefined {
		if (!this.ownerExtensionId || !this.resourceId) return undefined;
		return {
			extensionId: this.ownerExtensionId,
			resourceId: this.resourceId,
			version: this.version,
		};
	}

	rebuild(
		records: readonly IndexedExpression[],
		version?: string | number,
	): readonly ResourceDiagnostic[] {
		if (version !== undefined) {
			this.version = version;
		}
		this.expressions = [];
		this.diagnostics = [];
		for (const record of records) {
			if (!record.active) continue;
			try {
				new RegExp(record.regexPattern, record.isCaseInsensitive ? "iu" : "u");
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
			this.expressions.push({
				...record,
				lookupTerm: normalizeLookupTerm(record.lookupTerm),
			});
		}
		this.expressions.sort(compareExpressions);
		return this.diagnostics;
	}

	search(request: ExpressionSearchRequest): readonly ExpressionCandidate[] {
		const candidates: ExpressionCandidate[] = [];
		for (const expression of this.expressions) {
			const flags = expression.isCaseInsensitive ? "giu" : "gu";
			let regex: RegExp;
			try {
				regex = new RegExp(expression.regexPattern, flags);
			} catch {
				continue;
			}
			for (const match of execAll(regex, request.text)) {
				const start = match.index;
				const end = start + match[0].length;
				if (
					end <= start ||
					!this.segmenter.isWordBoundary(request.text, start, end)
				)
					continue;
				candidates.push(
					candidate(expression, request.text, start, end, "exact", this),
				);
			}

			for (const alias of new Set([expression.term, expression.lookupTerm])) {
				const normalizedAlias = normalizeForExpression(
					alias,
					expression.isCaseInsensitive,
				);
				if (!normalizedAlias) continue;
				for (const start of boundaryStarts(request.text, this.segmenter)) {
					const partial = request.text.slice(start).trimEnd();
					const normalizedPartial = normalizeForExpression(
						partial,
						expression.isCaseInsensitive,
					);
					if (
						!normalizedPartial ||
						normalizedPartial.length >= normalizedAlias.length
					)
						continue;
					if (startsWith(normalizedPartial, normalizedAlias)) {
						candidates.push(
							candidate(
								expression,
								request.text,
								start,
								request.text.length,
								"prefix",
								this,
							),
						);
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

export function indexedExpressionFromSeed(
	seed: ExpressionSeed,
): IndexedExpression {
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
	index?: ExpressionIndex,
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
		...(index?.ownerExtensionId
			? { ownerExtensionId: index.ownerExtensionId }
			: {}),
		...(index?.resourceId ? { resourceId: index.resourceId } : {}),
		...((index?.resolverId ?? index?.resourceId)
			? { resolverId: index?.resolverId ?? index?.resourceId }
			: {}),
		...(index?.version !== undefined ? { resolverVersion: index.version } : {}),
	};
}

function compareExpressions(
	left: IndexedExpression,
	right: IndexedExpression,
): number {
	return (
		right.priorityWeight - left.priorityWeight ||
		left.id.localeCompare(right.id)
	);
}

function compareCandidates(
	left: ExpressionCandidate,
	right: ExpressionCandidate,
): number {
	return (
		(right.priority ?? 0) - (left.priority ?? 0) ||
		right.end - right.start - (left.end - left.start) ||
		left.start - right.start ||
		left.id.localeCompare(right.id)
	);
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

function boundaryStarts(
	text: string,
	segmenter: UniversalWordSegmenter,
): number[] {
	const starts: number[] = [];
	for (let index = 0; index < text.length; index += 1) {
		if (/\s/u.test(text[index]!)) continue;
		if (
			index === 0 ||
			/\s/u.test(text[index - 1]!) ||
			segmenter.isWordBoundary(text, index, index)
		) {
			starts.push(index);
		}
	}
	return starts;
}

function startsWith(value: string, prefix: string): boolean {
	return value === prefix.slice(0, value.length);
}

function normalizeForExpression(value: string, insensitive: boolean): string {
	const normalized = value.normalize("NFKC").trim().replace(/\s+/g, " ");
	return insensitive ? normalizeLookupTerm(normalized) : normalized;
}
