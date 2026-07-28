import type { DictionaryStore } from "@stateful-mcp/core";
import type { CodeableConcept } from "../../schemas/shared";
import type {
	AttributeParserRule,
	ConceptFieldStore,
	ParserConceptDefaultStore,
	ParserDictionaryRule,
} from "../../store/interfaces";
import type { ParsedCellHistoryStore } from "../../store/learning/interfaces";
import { getCompiledRegex } from "../_compiled-regex";
import {
	ClinicalDateRangeHelper,
	ClinicalDateRangeTokenizer,
} from "../helpers/clinical-date-range-helper";
import type {
	ParsedCandidateEnvelope,
	ParsedClinicalDateRangeItem,
	ParsedItemUnion,
	PreparsedContext,
	SchemaParser,
} from "../schema-parsers";

export class ClinicalDateRangeSchemaParser implements SchemaParser {
	targetSchema = "ClinicalDateRange" as const;

	async preview(
		tag: string,
		content: string,
		dictionaryStore: DictionaryStore,
		conceptDefaultsStore?: ParserConceptDefaultStore,
		attributeRules?: AttributeParserRule[],
		evaluatorRules?: ParserDictionaryRule[],
		termTokenizer?: string,
		allowedNamespaces?: string[],
		preparsedContext?: PreparsedContext,
		historyStore?: ParsedCellHistoryStore,
		conceptFieldStore?: ConceptFieldStore,
		concepts?: CodeableConcept[],
	): Promise<ParsedCandidateEnvelope> {
		const parsed = await this.parse(
			tag,
			content,
			dictionaryStore,
			conceptDefaultsStore,
			attributeRules,
			evaluatorRules,
			termTokenizer,
			allowedNamespaces,
			preparsedContext,
		);
		return makePreviewEnvelope(parsed);
	}

	async parse(
		tag: string,
		content: string,
		dictionaryStore: DictionaryStore,
		conceptDefaultsStore?: ParserConceptDefaultStore,
		attributeRules?: AttributeParserRule[],
		evaluatorRules?: ParserDictionaryRule[],
		termTokenizer?: string,
		allowedNamespaces?: string[],
		preparsedContext?: PreparsedContext,
		conceptFieldStore?: ConceptFieldStore,
		concepts?: CodeableConcept[],
	): Promise<ParsedItemUnion | ParsedItemUnion[] | null> {
		const attrRules = attributeRules || [];
		const evalRules = evaluatorRules || [];
		const cleaned = content.trim();
		if (!cleaned) return null;

		// 1. Gather all date-like spans (time spans from preparsedContext and calendar dates from attributeRules)
		const spans: { start: number; end: number }[] = [];

		if (preparsedContext?.timeSpan) {
			for (const c of preparsedContext.timeSpan) {
				spans.push({ start: c.tokenStart, end: c.tokenEnd });
			}
		}

		const calendarRules = attrRules.filter(
			(rule) => rule.targetField === "calendar_date",
		);
		for (const rule of calendarRules) {
			for (const pattern of rule.regexPatterns) {
				try {
					// We compile the regex globally to find all occurrences in the segment
					const rawRegex = getCompiledRegex(pattern, "i");
					const globalRegex = new RegExp(
						rawRegex.source,
						rawRegex.flags.includes("g")
							? rawRegex.flags
							: rawRegex.flags + "g",
					);
					let match = globalRegex.exec(cleaned);
					while (match !== null) {
						spans.push({
							start: match.index,
							end: match.index + match[0].length,
						});
						match = globalRegex.exec(cleaned);
					}
				} catch {
					// Fallback if regex fails to compile
				}
			}
		}

		// Sort spans by start position
		spans.sort((a, b) => a.start - b.start);

		// Merge overlapping spans
		const mergedSpans: { start: number; end: number }[] = [];
		for (const span of spans) {
			if (mergedSpans.length === 0) {
				mergedSpans.push(span);
			} else {
				const last = mergedSpans[mergedSpans.length - 1]!;
				if (span.start <= last.end) {
					last.end = Math.max(last.end, span.end);
				} else {
					mergedSpans.push(span);
				}
			}
		}

		const results: ParsedClinicalDateRangeItem[] = [];

		// First tokenize the whole string to see if it represents a single unified range/list/exclusion
		const unsplitToken = ClinicalDateRangeTokenizer.tokenize(
			cleaned,
			attrRules,
			evalRules,
		);
		let shouldSplit = true;
		if (unsplitToken) {
			const hasList =
				unsplitToken.listCalendarDates &&
				unsplitToken.listCalendarDates.length > 1;
			const hasRange =
				unsplitToken.startCalendarDate && unsplitToken.endCalendarDate;
			const hasExclusion = !!(
				unsplitToken.baseRepeat ||
				unsplitToken.exclusionRepeat ||
				unsplitToken.baseStartCalendarDate
			);
			if (hasList || hasRange || hasExclusion) {
				shouldSplit = false;
			}
		}

		// 2. If we found multiple disjoint spans and should split, try to split at the midpoints
		if (shouldSplit && mergedSpans.length > 1) {
			let allValid = true;
			const tempItems: ParsedClinicalDateRangeItem[] = [];

			for (let i = 0; i < mergedSpans.length; i++) {
				const start =
					i === 0
						? 0
						: Math.floor((mergedSpans[i - 1]!.end + mergedSpans[i]!.start) / 2);
				const end =
					i === mergedSpans.length - 1
						? cleaned.length
						: Math.floor((mergedSpans[i]!.end + mergedSpans[i + 1]!.start) / 2);
				const segment = cleaned.slice(start, end).trim();

				if (!segment) {
					allValid = false;
					break;
				}

				const token = ClinicalDateRangeTokenizer.tokenize(
					segment,
					attrRules,
					evalRules,
				);
				if (token) {
					const dateRange = ClinicalDateRangeHelper.build(token);
					if (dateRange) {
						tempItems.push({
							targetSchema: this.targetSchema,
							attributes: {},
							concept: [],
							rawText: `${tag} ${segment}`,
							tag,
							extractedData: dateRange as any,
						});
					} else {
						allValid = false;
						break;
					}
				} else {
					allValid = false;
					break;
				}
			}

			if (allValid && tempItems.length > 1) {
				return tempItems;
			}
		}

		// 3. Fallback to parsing the entire unsplit string
		if (!unsplitToken) return null;

		const dateRange = ClinicalDateRangeHelper.build(unsplitToken);
		if (!dateRange) return null;

		const attributes: Record<string, any> = {};
		const extractedData = (dateRange || {}) as Record<string, any>;

		return {
			targetSchema: this.targetSchema,
			attributes,
			concept: [],
			rawText: `${tag} ${cleaned}`,
			tag,
			extractedData,
		} as ParsedClinicalDateRangeItem;
	}
}

function makePreviewEnvelope(
	parsed: ParsedItemUnion | ParsedItemUnion[] | null,
): ParsedCandidateEnvelope {
	const parsedArr = Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
	return {
		deterministic: parsedArr,
		learned: parsedArr,
	};
}
