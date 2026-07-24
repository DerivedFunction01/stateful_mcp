import type { DictionaryStore } from "@stateful-mcp/core";
import {
	buildCalendarDateRules,
	buildNumericFieldRules,
	SEED_PARSER_PROFILES,
} from "../store/defaults";
import type {
	ParserConceptDefaultStore,
	ParserSyntaxProfile,
	StopWordContext,
	StopWordStore,
} from "../store/interfaces";
import type { ParsedCellHistoryStore } from "../store/parsed-cell-store";
import { getCompiledRegex } from "./_compiled-regex";
import { FrequencyHelper } from "./helpers/frequency-helper";
import { QuantityTokenizer } from "./helpers/measurement-helper";
import {
	type BaseParsedItem as IMP_BaseParsedItem,
	CANONICAL_TAGS as IMP_CANONICAL_TAGS,
	type ParsedItem as IMP_ParsedItem,
	type ParsedMedicationItem as IMP_ParsedMedicationItem,
	type ParsedObservationItem as IMP_ParsedObservationItem,
	type ParsedVitalsItem as IMP_ParsedVitalsItem,
	type ParserPreviewResult,
	type PreparsedContext,
	type RankingSignal,
	type SchemaParser,
	schemaParserRegistry,
} from "./schema-parsers";
import { StopWordParser } from "./stop-word-parser";

export const CANONICAL_TAGS = IMP_CANONICAL_TAGS;
export type ParsedItem = IMP_ParsedItem;
export type BaseParsedItem = IMP_BaseParsedItem;
export type ParsedVitalsItem = IMP_ParsedVitalsItem;
export type ParsedObservationItem = IMP_ParsedObservationItem;
export type ParsedMedicationItem = IMP_ParsedMedicationItem;

export class CdslParser {
	private stopWordParser: StopWordParser | undefined;
	private stopWordStore: StopWordStore | undefined;
	private attributeRules: import("../store/interfaces").AttributeParserRule[];

	constructor(
		private dictionaryStore: DictionaryStore,
		private profile: ParserSyntaxProfile = SEED_PARSER_PROFILES.find(
			(p) => p.profileId === "default",
		)!,
		private conceptDefaultsStore?: ParserConceptDefaultStore,
		stopWordParser?: StopWordParser,
		stopWordStore?: StopWordStore,
	) {
		this.stopWordParser = stopWordParser;
		this.stopWordStore = stopWordStore;
		this.attributeRules = [
			...(this.profile.attributeRules || []),
			...(this.profile.calendarDateFormats
				? buildCalendarDateRules(this.profile.calendarDateFormats)
				: []),
			...(this.profile.numericFieldFormats
				? buildNumericFieldRules(this.profile.numericFieldFormats)
				: []),
		];
	}

	private getEffectiveAttributeRules(): import("../store/interfaces").AttributeParserRule[] {
		return this.attributeRules;
	}

	async preview(
		text: string,
		context?: StopWordContext,
		historyStore?: ParsedCellHistoryStore,
	): Promise<ParserPreviewResult[]> {
		const effectiveStopWordParser = this.stopWordParser;
		if (!effectiveStopWordParser && this.stopWordStore && context) {
			const dynamicParser = await StopWordParser.fromStore(
				this.stopWordStore,
				context,
			);
			return this.previewWithStopWordParser(
				text,
				dynamicParser,
				context,
				historyStore,
			);
		}
		return this.previewWithStopWordParser(
			text,
			effectiveStopWordParser,
			context,
			historyStore,
		);
	}

	/**
	 * Parses a clinical dictation stream and extracts mapped schemas.
	 */
	async parse(text: string, context?: StopWordContext): Promise<ParsedItem[]> {
		// Resolve effective StopWordParser from store + context if not already set
		const effectiveStopWordParser = this.stopWordParser;
		if (!effectiveStopWordParser && this.stopWordStore && context) {
			const dynamicParser = await StopWordParser.fromStore(
				this.stopWordStore,
				context,
			);
			return this.parseWithStopWordParser(text, dynamicParser, context);
		}
		return this.parseWithStopWordParser(text, effectiveStopWordParser, context);
	}

	private async previewWithStopWordParser(
		text: string,
		effectiveStopWordParser: StopWordParser | undefined,
		context?: StopWordContext,
		historyStore?: ParsedCellHistoryStore,
	): Promise<ParserPreviewResult[]> {
		const results: ParserPreviewResult[] = [];
		const segments = text.split(this.profile.stateDelimiter);

		for (const segment of segments) {
			const trimmed = segment.trim();
			if (!trimmed) continue;

			let tag = "";
			let content = trimmed;
			if (trimmed.startsWith(this.profile.tagToken)) {
				const tagEndIndex = trimmed.indexOf(" ");
				if (tagEndIndex !== -1) {
					tag = trimmed.substring(0, tagEndIndex);
					content = trimmed.substring(tagEndIndex).trim();
				} else {
					content = "";
				}
			}
			if (!content) continue;

			if (!tag && effectiveStopWordParser) {
				const words = content.split(/\s+/).filter(Boolean);
				let stopWordCount = 0;
				for (const w of words) {
					if (effectiveStopWordParser.isStopWord(w)) {
						stopWordCount++;
					}
				}
				if (
					words.length > 0 &&
					stopWordCount / words.length > (this.profile.stopWordThreshold ?? 0.6)
				) {
					continue;
				}
			}

			const attrRules = this.getEffectiveAttributeRules();
			const candidates = QuantityTokenizer.tokenize(content, attrRules);
			const frequency = FrequencyHelper.parse(
				content,
				this.getEffectiveAttributeRules() || [],
				this.profile.evaluatorRules || [],
			);
			const attributes: Record<string, string> = {};
			const rules = [...this.getEffectiveAttributeRules()].sort((a, b) => {
				const pA = a.priority ?? 1;
				const pB = b.priority ?? 1;
				return pB - pA;
			});
			for (const rule of rules) {
				for (const pattern of rule.regexPatterns) {
					const flags = rule.isCaseInsensitive !== false ? "i" : "";
					const regex = getCompiledRegex(pattern, flags);
					if (regex.test(content)) {
						if (attributes[rule.targetField] === undefined) {
							attributes[rule.targetField] = rule.targetValue;
						}
					}
				}
			}
			const preparsedContext: PreparsedContext = {
				rawText: content,
				measurement: candidates,
				timeSpan: candidates,
				frequency,
				attributes,
				profile: this.profile,
				rankingSignals: buildRankingSignals(context, tag),
			};

			let mappedParser: SchemaParser | undefined;
			if (tag) {
				const tagToken = this.profile.tagToken;
				let cleanKey = tag.startsWith(tagToken)
					? tag.substring(tagToken.length).toLowerCase()
					: tag.toLowerCase();
				if (this.profile.tagMappings && this.profile.tagMappings[cleanKey]) {
					cleanKey = this.profile.tagMappings[cleanKey]!.toLowerCase();
				}
				mappedParser = schemaParserRegistry.get(cleanKey);
				if (!mappedParser) {
					for (const p of schemaParserRegistry.values()) {
						if (p.targetSchema.toLowerCase() === cleanKey) {
							mappedParser = p;
							break;
						}
					}
				}
			}

			const parsersToRun: SchemaParser[] = [];
			if (mappedParser) {
				parsersToRun.push(mappedParser);
			} else {
				for (const p of Array.from(schemaParserRegistry.values())) {
					parsersToRun.push(p);
				}
			}

			for (const parser of parsersToRun) {
				const allowedNamespaces =
					this.profile.schemaNamespaces?.[parser.targetSchema.toLowerCase()] ||
					undefined;
				if (parser.preview) {
					const preview = await parser.preview(
						tag,
						content,
						this.dictionaryStore,
						this.conceptDefaultsStore,
						this.getEffectiveAttributeRules(),
						this.profile.evaluatorRules,
						this.profile.termTokenizer,
						allowedNamespaces,
						preparsedContext,
						historyStore,
					);
					results.push({
						targetSchema: parser.targetSchema,
						deterministic: preview.deterministic,
						learned: preview.learned,
					});
				} else {
					const parsed = await parser.parse(
						tag,
						content,
						this.dictionaryStore,
						this.conceptDefaultsStore,
						this.getEffectiveAttributeRules(),
						this.profile.evaluatorRules,
						this.profile.termTokenizer,
						allowedNamespaces,
						preparsedContext,
					);
					results.push({
						targetSchema: parser.targetSchema,
						deterministic: parsed ? [parsed] : [],
						learned: parsed ? [parsed] : [],
					});
				}
			}
		}

		return results;
	}

	private async parseWithStopWordParser(
		text: string,
		effectiveStopWordParser: StopWordParser | undefined,
		context?: StopWordContext,
	): Promise<ParsedItem[]> {
		const items: ParsedItem[] = [];
		const segments = text.split(this.profile.stateDelimiter);
		const seenFinal = new Set<string>();

		for (const segment of segments) {
			const trimmed = segment.trim();
			if (!trimmed) continue;

			// Unify: for every segment, split tag from content using the profile's
			// tag token. Tag extraction happens regardless of tag status.
			let tag = "";
			let content = trimmed;
			if (trimmed.startsWith(this.profile.tagToken)) {
				const tagEndIndex = trimmed.indexOf(" ");
				if (tagEndIndex !== -1) {
					tag = trimmed.substring(0, tagEndIndex);
					content = trimmed.substring(tagEndIndex).trim();
				} else {
					content = "";
				}
			}
			if (!content) continue;

			// Stop Word Conversational Narrative Gatekeeper
			// If a tagless segment contains mostly stop words, treat it as narrative
			// and skip entity parsing. Known-tag segments are not gated here.
			if (!tag && effectiveStopWordParser) {
				const words = content.split(/\s+/).filter(Boolean);
				let stopWordCount = 0;
				for (const w of words) {
					if (effectiveStopWordParser.isStopWord(w)) {
						stopWordCount++;
					}
				}
				if (
					words.length > 0 &&
					stopWordCount / words.length > (this.profile.stopWordThreshold ?? 0.6)
				) {
					continue;
				}
			}

			// Always build preparsedContext from content
			const attrRules = this.getEffectiveAttributeRules();
			const candidates = QuantityTokenizer.tokenize(content, attrRules);
			const frequency = FrequencyHelper.parse(
				content,
				this.getEffectiveAttributeRules() || [],
				this.profile.evaluatorRules || [],
			);

			// Pre-extract standard localized attributes (e.g. certainty, severity, route)
			const attributes: Record<string, string> = {};
			const rules = [...this.getEffectiveAttributeRules()].sort((a, b) => {
				const pA = a.priority ?? 1;
				const pB = b.priority ?? 1;
				return pB - pA;
			});
			for (const rule of rules) {
				for (const pattern of rule.regexPatterns) {
					const flags = rule.isCaseInsensitive !== false ? "i" : "";
					const regex = getCompiledRegex(pattern, flags);
					if (regex.test(content)) {
						if (attributes[rule.targetField] === undefined) {
							attributes[rule.targetField] = rule.targetValue;
						}
					}
				}
			}

			const preparsedContext: PreparsedContext = {
				rawText: content,
				measurement: candidates,
				timeSpan: candidates,
				frequency,
				attributes,
				profile: this.profile,
				rankingSignals: buildRankingSignals(context, tag),
			};

			// Resolve tag to a schema parser
			let mappedParser: SchemaParser | undefined;
			if (tag) {
				const tagToken = this.profile.tagToken;
				let cleanKey = tag.startsWith(tagToken)
					? tag.substring(tagToken.length).toLowerCase()
					: tag.toLowerCase();

				if (this.profile.tagMappings && this.profile.tagMappings[cleanKey]) {
					cleanKey = this.profile.tagMappings[cleanKey]!.toLowerCase();
				}

				mappedParser = schemaParserRegistry.get(cleanKey);
				if (!mappedParser) {
					for (const p of schemaParserRegistry.values()) {
						if (p.targetSchema.toLowerCase() === cleanKey) {
							mappedParser = p;
							break;
						}
					}
				}
			}

			// Determine which parsers to run
			const parsersToRun: SchemaParser[] = [];
			if (mappedParser) {
				parsersToRun.push(mappedParser);
			} else {
				// Unknown tag or tagless: run all parsers allowed by the profile
				for (const p of Array.from(schemaParserRegistry.values())) {
					parsersToRun.push(p);
				}
			}

			// Dispatch selected parsers against the full span
			for (const parser of parsersToRun) {
				const allowedNamespaces =
					this.profile.schemaNamespaces?.[parser.targetSchema.toLowerCase()] ||
					undefined;

				const parsed = await parser.parse(
					tag,
					content,
					this.dictionaryStore,
					this.conceptDefaultsStore,
					this.getEffectiveAttributeRules(),
					this.profile.evaluatorRules,
					this.profile.termTokenizer,
					allowedNamespaces,
					preparsedContext,
				);

				if (parsed && parsed.conceptId) {
					const key = `${parsed.targetSchema}:${parsed.conceptId}`;
					if (!seenFinal.has(key)) {
						seenFinal.add(key);
						items.push(parsed);
					}
				}
			}
		}

		return items;
	}
}

function buildRankingSignals(
	context: StopWordContext | undefined,
	tag: string,
): RankingSignal | undefined {
	if (!context) return undefined;
	const patientContext = context.patientContext;
	return {
		personnelId: context.personnelId,
		specialtyId: context.specialtyId,
		facilityId: context.facilityId,
		patientId: patientContext?.patientId,
		organismType: patientContext?.organismType,
		gender: patientContext?.gender,
		ageBucket: patientContext?.ageBucket,
		speciesBucket: patientContext?.speciesBucket,
		subBucket: patientContext?.subBucket,
		bucketKey: patientContext?.bucketKey,
		tag,
	};
}
