import type { DictionaryStore } from "@stateful-mcp/core";
import { SEED_PARSER_PROFILES } from "../store/defaults";
import type {
	ParserConceptDefaultStore,
	ParserSyntaxProfile,
	StopWordContext,
	StopWordStore,
} from "../store/interfaces";
import { FrequencyHelper } from "./helpers/frequency-helper";
import { MeasurementHelper, TimeHelper } from "./helpers/measurement-helper";
import {
	type BaseParsedItem as IMP_BaseParsedItem,
	CANONICAL_TAGS as IMP_CANONICAL_TAGS,
	type ParsedItem as IMP_ParsedItem,
	type ParsedMedicationItem as IMP_ParsedMedicationItem,
	type ParsedObservationItem as IMP_ParsedObservationItem,
	type ParsedVitalsItem as IMP_ParsedVitalsItem,
	type PreparsedContext,
	resolveMultiConceptHelper,
	type ScoredParseResult,
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
			return this.parseWithStopWordParser(text, dynamicParser);
		}
		return this.parseWithStopWordParser(text, effectiveStopWordParser);
	}

	private async parseWithStopWordParser(
		text: string,
		effectiveStopWordParser: StopWordParser | undefined,
	): Promise<ParsedItem[]> {
		const items: ParsedItem[] = [];
		const segments = text.split(this.profile.stateDelimiter);
		const seenFinal = new Set<string>();

		for (const segment of segments) {
			const trimmed = segment.trim();
			if (!trimmed) continue;

			// Extract tag
			if (trimmed.startsWith(this.profile.tagToken)) {
				const tagEndIndex = trimmed.indexOf(" ");
				const tag =
					tagEndIndex === -1 ? trimmed : trimmed.substring(0, tagEndIndex);
				const content =
					tagEndIndex === -1 ? "" : trimmed.substring(tagEndIndex).trim();
				if (tag && content) {
					const parsed = await this.parseSegment(
						tag,
						content,
						undefined,
						effectiveStopWordParser,
					);
					if (parsed) {
						items.push(parsed);
					}
				}
			} else {
				// Stop Word Conversational Narrative Gatekeeper
				// If a segment contains mostly stop words, treat it as narrative and skip entity parsing.
				if (effectiveStopWordParser) {
					const words = trimmed.split(/\s+/).filter(Boolean);
					let stopWordCount = 0;
					for (const w of words) {
						if (effectiveStopWordParser.isStopWord(w)) {
							stopWordCount++;
						}
					}
					if (words.length > 0 && stopWordCount / words.length > 0.6) {
						continue;
					}
				}

				// Build the shared PreparsedContext (run sub-parsers only once)
				const measurement = MeasurementHelper.parse(
					trimmed,
					undefined,
					this.profile.attributeRules,
				) as any;
				const timeSpan = TimeHelper.parse(trimmed, this.profile.attributeRules);
				const frequency = FrequencyHelper.parse(
					trimmed,
					this.profile.attributeRules || [],
					this.profile.evaluatorRules || [],
				);

				// Pre-extract standard localized attributes (e.g. certainty, severity, route)
				const attributes: Record<string, string> = {};
				const rules = this.profile.attributeRules || [];
				for (const rule of rules) {
					for (const pattern of rule.regexPatterns) {
						const flags = rule.isCaseInsensitive !== false ? "i" : "";
						const regex = new RegExp(pattern, flags);
						if (regex.test(trimmed)) {
							attributes[rule.targetField] = rule.targetValue;
						}
					}
				}

				const preparsedContext: PreparsedContext = {
					rawText: trimmed,
					measurement,
					timeSpan,
					frequency,
					attributes,
				};

				// Collect namespaces from the profile's schemaNamespaces configuration.
				const namespacesToSearch: string[] = [];
				if (this.profile.schemaNamespaces) {
					const allNs = new Set<string>();
					for (const nsList of Object.values(this.profile.schemaNamespaces)) {
						for (const ns of nsList) allNs.add(ns);
					}
					namespacesToSearch.push(...Array.from(allNs));
				}

				// Profile-driven matching: match segment tokens using dictionary/namespaces
				// 1. Try to match the full trimmed segment as a unified concept
				const candidates: any[] = [];
				const fullCandidates = await resolveMultiConceptHelper(
					trimmed,
					this.dictionaryStore,
					this.profile.termTokenizer,
					namespacesToSearch,
				);
				if (fullCandidates && fullCandidates.length > 0) {
					candidates.push(...fullCandidates);
				}

				// 2. If no full match, fall back to individual token words matching
				if (candidates.length === 0) {
					const tokenWords = trimmed
						.split(/[\s,.;:!?||]+/)
						.filter(
							(w) =>
								w &&
								(!effectiveStopWordParser ||
									!effectiveStopWordParser.isStopWord(w)),
						);
					for (const word of tokenWords) {
						const wordCandidates = await resolveMultiConceptHelper(
							word,
							this.dictionaryStore,
							this.profile.termTokenizer,
							namespacesToSearch,
						);
						if (wordCandidates) {
							candidates.push(...wordCandidates);
						}
					}
				}

				// Deduplicate concept candidates
				const seenConceptIds = new Set<string>();
				const uniqueCandidates = candidates.filter((c) => {
					if (seenConceptIds.has(c.conceptId)) return false;
					seenConceptIds.add(c.conceptId);
					return true;
				});

				// Dispatch candidates in parallel to all pipelines
				const parsedList: ScoredParseResult[] = [];
				for (const candidate of uniqueCandidates) {
					const parsers = Array.from(schemaParserRegistry.values());
					const candidateList: ScoredParseResult[] = [];

					for (const parser of parsers) {
						const cleanKey = parser.targetSchema.toLowerCase();
						const allowedNamespaces =
							this.profile.schemaNamespaces?.[cleanKey] || undefined;

						// Skip running parser if the candidate resolved namespace is not in this parser's allowedNamespaces
						if (
							allowedNamespaces &&
							!allowedNamespaces.includes(candidate.namespace)
						) {
							continue;
						}

						// Execute virtual parse pipeline
						const parsed = await parser.parse(
							"",
							trimmed,
							this.dictionaryStore,
							this.conceptDefaultsStore,
							this.profile.attributeRules,
							this.profile.evaluatorRules,
							this.profile.termTokenizer,
							allowedNamespaces,
							preparsedContext,
						);

						if (parsed && parsed.conceptId) {
							// Compute completeness score: count of non-null populated fields
							let completenessScore = 0;
							let unitAnchorCoherence = false;

							if (parsed.targetSchema === CANONICAL_TAGS.VITALS) {
								const v = parsed as ParsedVitalsItem;
								if (v.value !== undefined) completenessScore++;
								if (v.unit) completenessScore++;
								if (v.unitAnchor) {
									completenessScore++;
									// Check unit anchor coherence (e.g. temperature -> temp)
									if (
										v.unitAnchor === "temperature" &&
										candidate.display.toLowerCase().includes("temp")
									) {
										unitAnchorCoherence = true;
									}
								}
							} else if (parsed.targetSchema === CANONICAL_TAGS.OBSERVATION) {
								const o = parsed as ParsedObservationItem;
								if (o.certainty) completenessScore++;
								if (o.status) completenessScore++;
								if (o.severity) completenessScore++;
							} else if (parsed.targetSchema === CANONICAL_TAGS.MEDICATION) {
								const m = parsed as ParsedMedicationItem;
								if (m.route) completenessScore++;
								if (m.frequency) completenessScore++;
								if (m.duration) completenessScore++;
							}

							candidateList.push({
								parsedItem: parsed,
								completenessScore,
								unitAnchorCoherence,
							});
						}
					}

					// Filter out extremely low confidence candidate results, select winning schemas
					if (candidateList.length > 0) {
						// Sort by completeness score, tiebreaking by unitAnchorCoherence
						candidateList.sort((a, b) => {
							if (b.completenessScore !== a.completenessScore) {
								return b.completenessScore - a.completenessScore;
							}
							if (b.unitAnchorCoherence !== a.unitAnchorCoherence) {
								return (
									(b.unitAnchorCoherence ? 1 : 0) -
									(a.unitAnchorCoherence ? 1 : 0)
								);
							}
							return 0;
						});

						// Support multi-match: allow all high completeness candidate schemas to compile (e.g. completenessScore >= 1)
						const topScore = candidateList[0]?.completenessScore || 0;
						const winners = candidateList.filter(
							(c) =>
								c.completenessScore === topScore || c.completenessScore >= 1,
						);
						for (const w of winners) {
							parsedList.push(w);
						}
					}
				}

				// Deduplicate final parsed items by schema + conceptId
				for (const r of parsedList) {
					const key = `${r.parsedItem.targetSchema}:${r.parsedItem.conceptId}`;
					if (!seenFinal.has(key)) {
						seenFinal.add(key);
						items.push(r.parsedItem);
					}
				}
			}
		}

		return items;
	}

	private async parseSegment(
		tag: string,
		content: string,
		preparsedContext?: PreparsedContext,
		effectiveStopWordParser?: StopWordParser,
	): Promise<ParsedItem | null> {
		if (effectiveStopWordParser?.isStopWord(content)) {
			return null;
		}
		// Strip the tag token (e.g. '#' or '$') to find the tag key
		const tagToken = this.profile.tagToken;
		let cleanKey = tag.startsWith(tagToken)
			? tag.substring(tagToken.length).toLowerCase()
			: tag.toLowerCase();

		// Apply profile-configured tag mappings for internationalization/localization/poweruser support
		if (this.profile.tagMappings && this.profile.tagMappings[cleanKey]) {
			cleanKey = this.profile.tagMappings[cleanKey]!.toLowerCase();
		}

		// Find registered parser by targetSchema name or lowercase key
		let parser = schemaParserRegistry.get(cleanKey);
		if (!parser) {
			// Fallback: search by canonical target schema name
			for (const p of schemaParserRegistry.values()) {
				if (p.targetSchema.toLowerCase() === cleanKey) {
					parser = p;
					break;
				}
			}
		}

		if (parser) {
			const allowedNamespaces =
				this.profile.schemaNamespaces?.[cleanKey] ||
				this.profile.schemaNamespaces?.[parser.targetSchema.toLowerCase()] ||
				undefined;

			return await parser.parse(
				tag,
				content,
				this.dictionaryStore,
				this.conceptDefaultsStore,
				this.profile.attributeRules,
				this.profile.evaluatorRules,
				this.profile.termTokenizer,
				allowedNamespaces,
				preparsedContext,
			);
		}
		return null;
	}
}
