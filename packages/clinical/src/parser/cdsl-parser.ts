import {
	type DictionaryStore,
	executePipeline,
	MemoryVariableStore,
	type VariableService,
	VariableServiceStore,
} from "@stateful-mcp/core";
import type {
	AttributeParserRule,
	ConceptFieldRule,
	ConceptFieldStore,
	ParserConceptDefaultStore,
	ParserMacroStore,
	ParserProfileStore,
	ParserSyntaxProfile,
	StopWordContext,
	StopWordStore,
} from "../store/interfaces";
import type { ParsedCellHistoryStore } from "../store/learning/interfaces";
import type { AutocompleteSuggestion } from "../store/reference/auto-complete/interfaces";
import type { ProseParserTemplateStore } from "../store/reference/prose-parser-templates/interfaces";
import {
	buildCalendarDateRules,
	buildNumericFieldRules,
} from "../store/rules-builder";
import { getCompiledRegex } from "./_compiled-regex";
import type {
	SharedFieldAnchorRule,
	SharedFieldAnchorStore,
} from "./field-shared/shared-field-anchor";
import { FrequencyHelper } from "./helpers/frequency-helper";
import { QuantityTokenizer } from "./helpers/measurement-helper";
import { MacroExpander } from "./macro-expander";
import { ProseParser } from "./prose-parser";
import { ProseTemplateSuggester } from "./prose-template-suggester";
import {
	type ParsedCandidateEnvelope,
	type ParsedItem,
	type PreparsedContext,
	type RankingSignal,
	resolveMultiConceptHelper,
	type SchemaParser,
	schemaParserRegistry,
} from "./schema-parsers";
import { StopWordParser } from "./stop-word-parser";
import { CdslVariableParser } from "./variable-parser";

interface ParserPreviewResult extends ParsedCandidateEnvelope {
	targetSchema: string;
}

export class CdslParser {
	private stopWordParser: StopWordParser | undefined;
	private stopWordStore: StopWordStore | undefined;
	private attributeRules: AttributeParserRule[];

	private static readonly SCHEMAS_WITHOUT_CONCEPT = new Set([
		"ClinicalDateRange",
	]);

	constructor(
		private dictionaryStore: DictionaryStore,
		private profile: ParserSyntaxProfile,
		private conceptDefaultsStore?: ParserConceptDefaultStore,
		stopWordParser?: StopWordParser,
		stopWordStore?: StopWordStore,
		private conceptFieldStore?: ConceptFieldStore,
		private proseTemplateStore?: ProseParserTemplateStore,
		private sharedFieldAnchorStore?: SharedFieldAnchorStore,
		private macroStore?: ParserMacroStore,
		private variableService?: VariableService,
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

	/**
	 * Creates a CdslParser by resolving a parser profile from a store.
	 *
	 * This is the config-backed factory — it resolves the profile from a
	 * ParserProfileStore (which may be seeded from config) rather than
	 * falling back to a hardcoded seed constant.
	 *
	 * @param dictionaryStore - Dictionary store for concept resolution
	 * @param profileStore - Store to resolve the parser profile from
	 * @param profileId - The profile ID to resolve (defaults to "default")
	 * @param conceptDefaultsStore - Optional concept default store
	 * @param stopWordParser - Optional pre-configured stop word parser
	 * @param stopWordStore - Optional stop word store for dynamic resolution
	 * @param conceptFieldStore - Optional concept field store
	 * @param proseTemplateStore - Optional prose parser template store
	 * @param sharedFieldAnchorStore - Optional shared field anchor store
	 * @param macroStore - Optional macro store for macro expansion
	 */
	static async create(
		dictionaryStore: DictionaryStore,
		profileStore: ParserProfileStore,
		profileId: string = "default",
		conceptDefaultsStore?: ParserConceptDefaultStore,
		stopWordParser?: StopWordParser,
		stopWordStore?: StopWordStore,
		conceptFieldStore?: ConceptFieldStore,
		proseTemplateStore?: ProseParserTemplateStore,
		sharedFieldAnchorStore?: SharedFieldAnchorStore,
		macroStore?: ParserMacroStore,
	): Promise<CdslParser> {
		const profile = await profileStore.get(profileId);
		if (!profile) {
			throw new Error(
				`CdslParser.create: parser profile "${profileId}" not found in store. ` +
					`Ensure the profile is seeded in the clinical config.`,
			);
		}
		return new CdslParser(
			dictionaryStore,
			profile,
			conceptDefaultsStore,
			stopWordParser,
			stopWordStore,
			conceptFieldStore,
			proseTemplateStore,
			sharedFieldAnchorStore,
			macroStore,
		);
	}

	private getEffectiveAttributeRules(): AttributeParserRule[] {
		return this.attributeRules;
	}

	private async applyVariables(
		text: string,
		context?: StopWordContext,
	): Promise<string> {
		const sessionId = (context as any)?.sessionId || "default_session";
		const service =
			this.variableService ||
			new VariableServiceStore(new MemoryVariableStore());
		return CdslVariableParser.parseAndApply(
			text,
			service,
			sessionId,
			this.profile,
			this.dictionaryStore,
		);
	}

	private async expandMacros(text: string): Promise<string> {
		if (!this.macroStore) return text;
		return MacroExpander.expand(text, this.macroStore, this.profile);
	}

	async suggestAutocomplete(
		partialText: string,
		context: StopWordContext,
	): Promise<AutocompleteSuggestion[]> {
		if (!this.proseTemplateStore) return [];
		const suggester = new ProseTemplateSuggester(
			this.proseTemplateStore,
			this.stopWordStore,
		);
		return suggester.suggest(partialText, {
			personnelId: context.personnelId,
			workspaceId: context.workspaceId,
			specialtyId: context.specialtyId,
			locale: context.locale,
		});
	}

	async preview(
		text: string,
		context?: StopWordContext,
		historyStore?: ParsedCellHistoryStore,
	): Promise<ParserPreviewResult[]> {
		const cleanText = await this.applyVariables(text, context);
		const expanded = await this.expandMacros(cleanText);
		const effectiveStopWordParser = this.stopWordParser;
		if (!effectiveStopWordParser && this.stopWordStore && context) {
			const dynamicParser = await StopWordParser.fromStore(
				this.stopWordStore,
				context,
			);
			return this.previewWithStopWordParser(
				expanded,
				dynamicParser,
				context,
				historyStore,
			);
		}
		return this.previewWithStopWordParser(
			expanded,
			effectiveStopWordParser,
			context,
			historyStore,
		);
	}

	/**
	 * Parses a clinical dictation stream and extracts mapped schemas.
	 */
	private getSegmentSplitRegex(): RegExp {
		const parts = [
			this.profile.stateDelimiter.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&"),
		];
		if (this.profile.boundaryDelimiter) {
			parts.push(this.profile.boundaryDelimiter);
		}
		return new RegExp(parts.join("|"));
	}

	async parse(text: string, context?: StopWordContext): Promise<ParsedItem[]> {
		const cleanText = await this.applyVariables(text, context);
		const expanded = await this.expandMacros(cleanText);
		const effectiveStopWordParser = this.stopWordParser;
		if (!effectiveStopWordParser && this.stopWordStore && context) {
			const dynamicParser = await StopWordParser.fromStore(
				this.stopWordStore,
				context,
			);
			return this.parseWithStopWordParser(
				expanded,
				dynamicParser,
				context,
				undefined,
				expanded,
			);
		}
		return this.parseWithStopWordParser(
			expanded,
			effectiveStopWordParser,
			context,
			undefined,
			expanded,
		);
	}

	async parseWithHistory(
		text: string,
		context?: StopWordContext,
		historyStore?: ParsedCellHistoryStore,
	): Promise<ParsedItem[]> {
		const cleanText = await this.applyVariables(text, context);
		const expanded = await this.expandMacros(cleanText);
		const effectiveStopWordParser = this.stopWordParser;
		if (!effectiveStopWordParser && this.stopWordStore && context) {
			const dynamicParser = await StopWordParser.fromStore(
				this.stopWordStore,
				context,
			);
			return this.parseWithStopWordParser(
				expanded,
				dynamicParser,
				context,
				historyStore,
				expanded,
			);
		}
		return this.parseWithStopWordParser(
			expanded,
			effectiveStopWordParser,
			context,
			historyStore,
			expanded,
		);
	}

	private async previewWithStopWordParser(
		text: string,
		effectiveStopWordParser: StopWordParser | undefined,
		context?: StopWordContext,
		historyStore?: ParsedCellHistoryStore,
	): Promise<ParserPreviewResult[]> {
		const results: ParserPreviewResult[] = [];

		// 1. Run ProseParser if template store is configured
		const { proseItems, remainingText, remnants } = await this.runProseParser(
			text,
			context,
			historyStore,
		);
		for (const item of [...proseItems, ...remnants]) {
			results.push({
				targetSchema: item.targetSchema,
				deterministic: [item as any],
				learned: [item as any],
			});
		}

		// 2. Parse remaining segments
		const segments = remainingText.split(this.getSegmentSplitRegex());

		for (const segment of segments) {
			const trimmed = segment.trim();
			if (!trimmed) continue;

			let tag = "";
			let content = trimmed;
			const escTagToken = this.profile.tagToken.replace(
				/[-/\\^$*+?.()|[\]{}]/g,
				"\\$&",
			);
			const tagRegex = new RegExp(
				`(?:\\s|^)(${escTagToken}[a-zA-Z0-9_-]+)(?:\\s|$)`,
			);
			const tagMatch = content.match(tagRegex);
			if (tagMatch) {
				tag = tagMatch[1] ?? "";
				content = content.replace(tagMatch[0], " ").trim();
				content = content.replace(/\s+/g, " ");
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
					const preview = await parser.preview({
						tag,
						content,
						dictionaryStore: this.dictionaryStore,
						conceptDefaultsStore: this.conceptDefaultsStore,
						attributeRules: this.getEffectiveAttributeRules(),
						evaluatorRules: this.profile.evaluatorRules,
						termTokenizer: this.profile.termTokenizer,
						allowedNamespaces,
						preparsedContext,
						historyStore,
					});
					results.push({
						targetSchema: parser.targetSchema,
						deterministic: preview.deterministic,
						learned: preview.learned,
					});
				} else {
					const parsed = await parser.parse({
						tag,
						content,
						dictionaryStore: this.dictionaryStore,
						conceptDefaultsStore: this.conceptDefaultsStore,
						attributeRules: this.getEffectiveAttributeRules(),
						evaluatorRules: this.profile.evaluatorRules,
						termTokenizer: this.profile.termTokenizer,
						allowedNamespaces,
						preparsedContext,
					});
					const parsedArr = Array.isArray(parsed)
						? parsed
						: parsed
							? [parsed]
							: [];
					results.push({
						targetSchema: parser.targetSchema,
						deterministic: parsedArr,
						learned: parsedArr,
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
		historyStore?: ParsedCellHistoryStore,
		originalFullText?: string,
	): Promise<ParsedItem[]> {
		const items: ParsedItem[] = [];
		const fullOriginalText = originalFullText || text;

		// 1. Run ProseParser if template store is configured
		const { proseItems, remainingText, remnants } = await this.runProseParser(
			text,
			context,
			historyStore,
		);
		items.push(...proseItems);
		items.push(...remnants);

		// 2. Parse remaining segments
		const segments = remainingText.split(this.getSegmentSplitRegex());
		const seenFinal = new Set<string>();

		for (const segment of segments) {
			const trimmed = segment.trim();
			if (!trimmed) continue;

			// Unify: for every segment, split tag from content using the profile's
			// tag token. Tag extraction happens regardless of tag status.
			let tag = "";
			let content = trimmed;
			const escTagToken = this.profile.tagToken.replace(
				/[-/\\^$*+?.()|[\]{}]/g,
				"\\$&",
			);
			const tagRegex = new RegExp(
				`(?:\\s|^)(${escTagToken}[a-zA-Z0-9_-]+)(?:\\s|$)`,
			);
			const tagMatch = content.match(tagRegex);
			if (tagMatch) {
				tag = tagMatch[1] ?? "";
				content = content.replace(tagMatch[0], " ").trim();
				content = content.replace(/\s+/g, " ");
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

			// Resolve concepts for concept-driven dispatch
			const resolvedConcepts = await resolveMultiConceptHelper(
				content,
				this.dictionaryStore,
				this.profile.termTokenizer,
				undefined,
			);

			// Look up ConceptFieldRule[] for resolved conceptIds
			const conceptFieldRules: ConceptFieldRule[] = [];
			if (this.conceptFieldStore && resolvedConcepts.length > 0) {
				const allRules = await this.conceptFieldStore.list();
				const matchedConceptIds = new Set(
					resolvedConcepts.map((c) => c.conceptId),
				);
				for (const rule of allRules) {
					if (matchedConceptIds.has(rule.conceptId)) {
						conceptFieldRules.push(rule);
					}
				}
			}

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

			// Build parsersToRun from tag + concept routing
			const conceptMatchedParsers: SchemaParser[] = [];
			if (conceptFieldRules.length > 0) {
				const matchedSchemas = new Set(
					conceptFieldRules.map((r) => r.targetSchema),
				);
				for (const schema of matchedSchemas) {
					for (const p of Array.from(schemaParserRegistry.values())) {
						if (p.targetSchema.toLowerCase() === schema.toLowerCase()) {
							conceptMatchedParsers.push(p);
						}
					}
				}
			}

			const parsersToRun: SchemaParser[] = [];
			if (mappedParser) {
				parsersToRun.push(mappedParser);
			}
			for (const p of conceptMatchedParsers) {
				if (!parsersToRun.includes(p)) {
					parsersToRun.push(p);
				}
			}
			if (parsersToRun.length === 0) {
				for (const p of Array.from(schemaParserRegistry.values())) {
					parsersToRun.push(p);
				}
			}

			// Dispatch selected parsers against the full span
			for (const parser of parsersToRun) {
				const allowedNamespaces =
					this.profile.schemaNamespaces?.[parser.targetSchema.toLowerCase()] ||
					undefined;
				const parsed =
					historyStore && parser.preview
						? await parser.preview({
								tag,
								content,
								dictionaryStore: this.dictionaryStore,
								conceptDefaultsStore: this.conceptDefaultsStore,
								attributeRules: this.getEffectiveAttributeRules(),
								evaluatorRules: this.profile.evaluatorRules,
								termTokenizer: this.profile.termTokenizer,
								allowedNamespaces,
								preparsedContext,
								historyStore,
							})
						: undefined;

				const learnedCandidate = parsed?.learned[0] || parsed?.deterministic[0];
				const deterministic = await parser.parse({
					tag,
					content,
					dictionaryStore: this.dictionaryStore,
					conceptDefaultsStore: this.conceptDefaultsStore,
					attributeRules: this.getEffectiveAttributeRules(),
					evaluatorRules: this.profile.evaluatorRules,
					termTokenizer: this.profile.termTokenizer,
					allowedNamespaces,
					preparsedContext,
				});
				const finalItem = learnedCandidate || deterministic;
				if (finalItem) {
					const finalItems = Array.isArray(finalItem) ? finalItem : [finalItem];
					for (const item of finalItems) {
						const requiresConcept = !CdslParser.SCHEMAS_WITHOUT_CONCEPT.has(
							item.targetSchema,
						);
						if (!requiresConcept || item.concept.length > 0) {
							// De-duplicate using segment-level index offset to allow duplicate concepts across distinct sentences
							const key = `${item.targetSchema}:${item.concept[0]?.conceptId ?? ""}:${JSON.stringify(item.extractedData)}:segment_${items.length}`;
							if (!seenFinal.has(key)) {
								seenFinal.add(key);
								items.push(item);
							}
						}
					}
				}
			}
		}

		// 3. Post-parse shared field anchoring enrichment pass
		if (this.sharedFieldAnchorStore) {
			try {
				const globalRules = await this.sharedFieldAnchorStore.listForContext(
					{},
				);
				const contextRules = await this.sharedFieldAnchorStore.listForContext({
					workspaceId: context?.workspaceId,
					personnelId: context?.personnelId || this.profile.personnelId,
				});

				const rulesMap = new Map<string, SharedFieldAnchorRule>();
				for (const r of globalRules) {
					rulesMap.set(r.targetSchema, r);
				}
				for (const r of contextRules) {
					rulesMap.set(r.targetSchema, r);
				}

				let lastIdx = 0;
				const itemOffsets = items.map((item) => {
					// Strip tags and trim to find the actual parsed content text within fullOriginalText
					const cleanTextMatch = item.rawText
						.replace(new RegExp(`^${item.tag}\\s*`), "")
						.trim();
					let idx = fullOriginalText.indexOf(cleanTextMatch, lastIdx);
					if (idx === -1) {
						idx = fullOriginalText.indexOf(cleanTextMatch);
					}
					if (idx === -1) {
						// Fallback to exact rawText match
						idx = fullOriginalText.indexOf(item.rawText, lastIdx);
					}
					if (idx === -1) {
						idx = fullOriginalText.indexOf(item.rawText);
					}
					const matchedLen =
						idx !== -1
							? fullOriginalText.includes(cleanTextMatch)
								? cleanTextMatch.length
								: item.rawText.length
							: 0;
					if (idx !== -1) {
						lastIdx = idx + matchedLen;
					}
					return {
						item,
						start: idx !== -1 ? idx : 0,
						end: idx !== -1 ? idx + matchedLen : 0,
					};
				});

				const anchoredCandidates = new Set<any>();

				for (let tIdx = 0; tIdx < items.length; tIdx++) {
					const targetItem = items[tIdx]!;
					const rule = rulesMap.get(targetItem.targetSchema);
					if (!rule) continue;

					const targetOffset = itemOffsets[tIdx]!;

					for (const anchor of rule.anchors) {
						let bestCandidate: (typeof items)[0] | null = null;
						let bestScore = -1;

						for (let cIdx = 0; cIdx < items.length; cIdx++) {
							if (cIdx === tIdx) continue;
							const candidateItem = items[cIdx]!;
							if (candidateItem.targetSchema !== anchor.source) continue;

							const candidateOffset = itemOffsets[cIdx]!;
							const isLeft = cIdx < tIdx;
							const itemDistance = Math.abs(tIdx - cIdx);

							const distanceConfig = anchor.distance || {};
							if (
								isLeft &&
								distanceConfig.maxLeft !== undefined &&
								itemDistance > distanceConfig.maxLeft
							) {
								continue;
							}
							if (
								!isLeft &&
								distanceConfig.maxRight !== undefined &&
								itemDistance > distanceConfig.maxRight
							) {
								continue;
							}

							const gapStart = isLeft ? candidateOffset.end : targetOffset.end;
							const gapEnd = isLeft
								? targetOffset.start
								: candidateOffset.start;
							const gapText =
								gapStart < gapEnd ? text.slice(gapStart, gapEnd) : "";

							const charDistance = gapText.length;
							let wordDistance = 0;
							if (distanceConfig.unit === "words") {
								const words = gapText.split(/\s+/).filter(Boolean);
								wordDistance = effectiveStopWordParser
									? words.filter((w) => !effectiveStopWordParser.isStopWord(w))
											.length
									: words.length;
							}

							if (distanceConfig.unit === "chars") {
								if (
									isLeft &&
									distanceConfig.maxLeft !== undefined &&
									charDistance > distanceConfig.maxLeft
								)
									continue;
								if (
									!isLeft &&
									distanceConfig.maxRight !== undefined &&
									charDistance > distanceConfig.maxRight
								)
									continue;
							} else if (distanceConfig.unit === "words") {
								if (
									isLeft &&
									distanceConfig.maxLeft !== undefined &&
									wordDistance > distanceConfig.maxLeft
								)
									continue;
								if (
									!isLeft &&
									distanceConfig.maxRight !== undefined &&
									wordDistance > distanceConfig.maxRight
								)
									continue;
							}

							if (anchor.anchorPattern) {
								const flags =
									anchor.anchorPatternCaseInsensitive !== false ? "i" : "";
								const regex = new RegExp(anchor.anchorPattern, flags);
								if (!regex.test(gapText)) {
									continue;
								}
							}

							// Delimiter boundary check
							const crossBoundaries = distanceConfig.crossBoundaries ?? false;
							if (!crossBoundaries) {
								const delimPattern =
									distanceConfig.boundaryDelimiterOverride !== undefined
										? distanceConfig.boundaryDelimiterOverride
										: this.profile.boundaryDelimiter;

								if (delimPattern) {
									const delimRegex = new RegExp(delimPattern);
									// Evaluate boundaries in the original text between start and end index instead of segment-split gapText
									const fullGapText = fullOriginalText.slice(gapStart, gapEnd);
									if (delimRegex.test(fullGapText)) {
										// Crossed a boundary! Check transitional words
										const transitions = distanceConfig.boundaryTransitionalWords
											? distanceConfig.boundaryTransitionalWords
											: this.profile.transitionalWords;
										let hasTransition = false;
										if (transitions && transitions.length > 0) {
											// Check if any transitional word is present in the gap text
											for (const tWord of transitions) {
												const tRegex = new RegExp(`\\b${tWord}\\b`, "i");
												if (tRegex.test(fullGapText)) {
													hasTransition = true;
													break;
												}
											}
										}
										if (!hasTransition) {
											continue;
										}
									}
								}
							}

							if (anchor.condition && anchor.condition.pipeline) {
								const pass = executePipeline(
									anchor.condition.pipeline,
									{
										source: candidateItem.extractedData,
										target: targetItem.extractedData,
										gapText,
									},
									{},
								);
								if (!pass) {
									continue;
								}
							}

							const unitFactor =
								distanceConfig.unit === "chars"
									? charDistance
									: distanceConfig.unit === "words"
										? wordDistance
										: itemDistance;
							const distanceScore = 1000 - unitFactor;
							if (distanceScore > bestScore) {
								bestScore = distanceScore;
								bestCandidate = candidateItem;
							}
						}

						if (bestCandidate) {
							const pathParts = anchor.targetField.split(".");
							let current = targetItem.extractedData;
							for (let i = 0; i < pathParts.length - 1; i++) {
								const part = pathParts[i]!;
								if (!current[part]) {
									current[part] = {};
								}
								current = current[part];
							}
							const lastPart = pathParts[pathParts.length - 1]!;
							current[lastPart] = bestCandidate.extractedData;
							anchoredCandidates.add(bestCandidate);
						}
					}
				}

				return items.filter((item) => !anchoredCandidates.has(item));
			} catch (e) {
				console.error("Shared field anchoring failed:", e);
			}
		}

		return items;
	}

	private async runProseParser(
		text: string,
		context?: StopWordContext,
		historyStore?: ParsedCellHistoryStore,
	): Promise<{
		proseItems: ParsedItem[];
		remainingText: string;
		remnants: ParsedItem[];
	}> {
		if (!this.proseTemplateStore) {
			return { proseItems: [], remainingText: text, remnants: [] };
		}

		const proseParser = new ProseParser(
			this.dictionaryStore,
			this.conceptFieldStore || (undefined as any),
			this.getEffectiveAttributeRules(),
			this.proseTemplateStore,
			this.profile,
		);

		const { parsedItems, consumedRanges, remnantSegments } =
			await proseParser.parse(text);

		// Construct remaining text by blanking out consumed ranges to preserve index positions
		let remainingText = text;
		for (const range of [...consumedRanges].reverse()) {
			remainingText =
				remainingText.substring(0, range.start) +
				" ".repeat(range.end - range.start) +
				remainingText.substring(range.end);
		}

		const remnants: ParsedItem[] = [];
		for (const rem of remnantSegments) {
			const parsedRemnants = await this.parseRemnantSegment(
				rem,
				context,
				historyStore,
			);
			remnants.push(...parsedRemnants);
		}

		return { proseItems: parsedItems, remainingText, remnants };
	}

	private async parseRemnantSegment(
		remnant: {
			text: string;
			remnantContext?: {
				targetSchema?: string;
				itemOverrides?: Record<string, any>;
				parentSlotLink?: string;
			};
		},
		context?: StopWordContext,
		historyStore?: ParsedCellHistoryStore,
	): Promise<ParsedItem[]> {
		const content = remnant.text.trim();
		if (!content) return [];

		const forcedSchema = remnant.remnantContext?.targetSchema;
		const overrides = remnant.remnantContext?.itemOverrides || {};

		const attrRules = this.getEffectiveAttributeRules();
		const candidates = QuantityTokenizer.tokenize(content, attrRules);
		const frequency = FrequencyHelper.parse(
			content,
			this.getEffectiveAttributeRules() || [],
			this.profile.evaluatorRules || [],
		);

		const attributes: Record<string, string> = { ...overrides };
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
			rankingSignals: buildRankingSignals(context, ""),
		};

		const allowedNamespaces = forcedSchema
			? this.profile.schemaNamespaces?.[forcedSchema.toLowerCase()] || undefined
			: undefined;

		const resolvedConcepts = await resolveMultiConceptHelper(
			content,
			this.dictionaryStore,
			this.profile.termTokenizer,
			allowedNamespaces,
		);

		const items: ParsedItem[] = [];
		const parsersToRun: SchemaParser[] = [];

		if (forcedSchema) {
			const parser = schemaParserRegistry.get(forcedSchema.toLowerCase());
			if (parser) {
				parsersToRun.push(parser);
			} else {
				for (const p of schemaParserRegistry.values()) {
					if (p.targetSchema.toLowerCase() === forcedSchema.toLowerCase()) {
						parsersToRun.push(p);
						break;
					}
				}
			}
		} else {
			for (const p of schemaParserRegistry.values()) {
				parsersToRun.push(p);
			}
		}

		for (const parser of parsersToRun) {
			const defaultNamespace =
				this.profile.schemaNamespaces?.[parser.targetSchema.toLowerCase()] ||
				undefined;
			const concepts = resolvedConcepts.filter((c) => {
				if (!c.conceptId) return false;
				if (!defaultNamespace) return true;
				const ns = c.conceptId.split("::")[0];
				return ns ? defaultNamespace.includes(ns) : false;
			});

			if (concepts.length === 0 && resolvedConcepts.length > 0) {
				concepts.push(...resolvedConcepts);
			}

			const result = await parser.parse({
				tag: "",
				content,
				dictionaryStore: this.dictionaryStore,
				conceptDefaultsStore: this.conceptDefaultsStore,
				attributeRules: this.getEffectiveAttributeRules(),
				evaluatorRules: this.profile.evaluatorRules,
				termTokenizer: this.profile.termTokenizer,
				allowedNamespaces: defaultNamespace,
				preparsedContext,
				conceptFieldStore: this.conceptFieldStore,
				concepts,
			});

			if (result) {
				const results = Array.isArray(result) ? result : [result];
				for (const res of results) {
					res.extractedData = {
						...res.extractedData,
						...overrides,
					};
					items.push(res);
				}
			}
		}

		const seenFinal = new Set<string>();
		const deduped: ParsedItem[] = [];
		for (const item of items) {
			const key = JSON.stringify(item.extractedData);
			if (!seenFinal.has(key)) {
				seenFinal.add(key);
				deduped.push(item);
			}
		}

		return deduped;
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
