import { type DictionaryStore, executePipeline } from "@stateful-mcp/core";
import type {
	AttributeParserRule,
	ConceptFieldStore,
	ParserConceptDefaultStore,
	ParserProfileStore,
	ParserSyntaxProfile,
	StopWordContext,
	StopWordStore,
} from "../store/interfaces";
import type {
	AutocompleteTransitionStore,
	ParseConfidenceScoreBreakdown,
	ParsedCellHistoryStore,
	ScoredParsedItem,
	SystemWeightStore,
} from "../store/learning/interfaces";
import type {
	CommandAutocompleteContext,
	CommandAutocompleteSuggestion,
} from "../store/reference/auto-complete/command-autocomplete-interfaces";
import type { AutocompleteSuggestion } from "../store/reference/auto-complete/interfaces";
import type { ProseParserTemplateStore } from "../store/reference/prose-parser-templates/interfaces";
import {
	buildCalendarDateRules,
	buildNumericFieldRules,
} from "../store/rules-builder";
import { SegmentProcessor } from "./cdsl-segment-processor";
import { CommandAutocompleteSuggester } from "./command/command-autocomplete-suggester";
import type {
	SharedFieldAnchorRule,
	SharedFieldAnchorStore,
} from "./field-shared/shared-field-anchor";
import { ProseParser } from "./prose-parser";
import { ProseTemplateSuggester } from "./prose-template-suggester";
import {
	type ParsedCandidateEnvelope,
	type ParsedItem,
	resolveMultiConceptHelper,
	type SchemaParser,
	schemaParserRegistry,
} from "./schema-parsers";
import { StopWordParser } from "./stop-word-parser";
import { TextPreprocessor } from "./text-preprocessor";

interface ParserPreviewResult extends ParsedCandidateEnvelope {
	targetSchema: string;
}

export interface ClinicalParseResult {
	items: ParsedItem[];
	scoredItems: ScoredParsedItem[];
	confidence?: {
		score: number;
		level: "high" | "medium" | "low";
		breakdown?: ParseConfidenceScoreBreakdown;
	};
}

function parseConfidenceLevel(score: number): "high" | "medium" | "low" {
	if (score >= 0.7) return "high";
	if (score >= 0.5) return "medium";
	return "low";
}

export interface CdslParserOptions {
	dictionaryStore: DictionaryStore;
	profile: ParserSyntaxProfile;
	conceptDefaultsStore?: ParserConceptDefaultStore;
	stopWordParser?: StopWordParser;
	stopWordStore?: StopWordStore;
	conceptFieldStore?: ConceptFieldStore;
	proseTemplateStore?: ProseParserTemplateStore;
	sharedFieldAnchorStore?: SharedFieldAnchorStore;
	weightStore?: SystemWeightStore;
	autocompleteTransitionStore?: AutocompleteTransitionStore;
	commandSuggester?: CommandAutocompleteSuggester;
}

export class CdslParser {
	private dictionaryStore: DictionaryStore;
	private profile: ParserSyntaxProfile;
	private conceptDefaultsStore?: ParserConceptDefaultStore;
	private stopWordParser: StopWordParser | undefined;
	private stopWordStore: StopWordStore | undefined;
	private conceptFieldStore?: ConceptFieldStore;
	private proseTemplateStore?: ProseParserTemplateStore;
	private sharedFieldAnchorStore?: SharedFieldAnchorStore;
	private weightStore?: SystemWeightStore;
	private autocompleteTransitionStore?: AutocompleteTransitionStore;
	private commandSuggester?: CommandAutocompleteSuggester;
	private attributeRules: AttributeParserRule[];
	private segmentProcessor: SegmentProcessor;
	private preprocessor: TextPreprocessor;

	private static readonly MAX_RECENT_SCHEMAS = 3;
	private recentTargetSchemas: string[] = [];

	private static readonly SCHEMAS_WITHOUT_CONCEPT = new Set([
		"ClinicalDateRange",
	]);

	constructor(options: CdslParserOptions) {
		this.dictionaryStore = options.dictionaryStore;
		this.profile = options.profile;
		this.conceptDefaultsStore = options.conceptDefaultsStore;
		this.stopWordParser = options.stopWordParser;
		this.stopWordStore = options.stopWordStore;
		this.conceptFieldStore = options.conceptFieldStore;
		this.proseTemplateStore = options.proseTemplateStore;
		this.sharedFieldAnchorStore = options.sharedFieldAnchorStore;
		this.weightStore = options.weightStore;
		this.autocompleteTransitionStore = options.autocompleteTransitionStore;
		this.commandSuggester = options.commandSuggester;
		this.attributeRules = [
			...(this.profile.attributeRules || []),
			...(this.profile.calendarDateFormats
				? buildCalendarDateRules(this.profile.calendarDateFormats)
				: []),
			...(this.profile.numericFieldFormats
				? buildNumericFieldRules(this.profile.numericFieldFormats)
				: []),
		];
		this.segmentProcessor = new SegmentProcessor(
			this.profile,
			this.attributeRules,
			this.conceptFieldStore,
			this.dictionaryStore,
		);
		this.preprocessor = new TextPreprocessor(this.profile);
	}

	/**
	 * Creates a CdslParser by resolving a parser profile from a store.
	 *
	 * This is the config-backed factory — it resolves the profile from a
	 * ParserProfileStore (which may be seeded from config) rather than
	 * falling back to a hardcoded seed constant.
	 *
	 * @param options - Parser configuration options
	 * @param options.dictionaryStore - Dictionary store for concept resolution
	 * @param options.profileStore - Store to resolve the parser profile from
	 * @param options.profileId - The profile ID to resolve (defaults to "default")
	 * @param options.conceptDefaultsStore - Optional concept default store
	 * @param options.stopWordParser - Optional pre-configured stop word parser
	 * @param options.stopWordStore - Optional stop word store for dynamic resolution
	 * @param options.conceptFieldStore - Optional concept field store
	 * @param options.proseTemplateStore - Optional prose parser template store
	 * @param options.sharedFieldAnchorStore - Optional shared field anchor store
	 */
	static async create(
		options: CdslParserOptions & {
			profileStore: ParserProfileStore;
			profileId?: string;
		},
	): Promise<CdslParser> {
		const {
			dictionaryStore,
			profileStore,
			profileId = "default",
			...rest
		} = options;
		const profile = await profileStore.get(profileId);
		if (!profile) {
			throw new Error(
				`CdslParser.create: parser profile "${profileId}" not found in store. ` +
					`Ensure the profile is seeded in the clinical config.`,
			);
		}
		return new CdslParser({ ...rest, dictionaryStore, profile });
	}

	private getEffectiveAttributeRules(): AttributeParserRule[] {
		return this.attributeRules;
	}

	getProfile(): ParserSyntaxProfile {
		return this.profile;
	}

	async resolveConcept(text: string): Promise<unknown> {
		const concepts = await resolveMultiConceptHelper(
			text,
			this.dictionaryStore,
			this.profile.termTokenizer,
		);
		return concepts[0];
	}

	getPreprocessor(): TextPreprocessor {
		return this.preprocessor;
	}

	async suggestAutocomplete(
		partialText: string,
		context: StopWordContext,
		commandContext?: CommandAutocompleteContext,
	): Promise<AutocompleteSuggestion[]> {
		// 1. Build effective command context — merge caller-provided context
		//    with the internal recentTargetSchemas buffer
		const effectiveCommandContext: CommandAutocompleteContext = {
			...commandContext,
			recentTargetSchemas:
				commandContext?.recentTargetSchemas ?? this.recentTargetSchemas,
		};

		// 2. Detect trigger character for command autocomplete
		const triggerChar = this.detectCommandTrigger(partialText);

		// 3. If trigger detected and suggester available, return command suggestions
		if (triggerChar && this.commandSuggester) {
			const commandSuggestions = await this.commandSuggester.suggest(
				partialText,
				triggerChar,
				effectiveCommandContext,
			);
			return commandSuggestions.map((s) => this.toAutocompleteSuggestion(s));
		}

		// 4. Otherwise, return prose template suggestions (existing behavior)
		if (!this.proseTemplateStore) return [];
		const suggester = new ProseTemplateSuggester(
			this.proseTemplateStore,
			this.stopWordStore,
		);
		const proseResults = await suggester.suggest(partialText, {
			personnelId: context.personnelId,
			workspaceId: context.workspaceId,
			specialtyId: context.specialtyId,
			locale: context.locale,
		});
		return proseResults.map((s) => ({ ...s, kind: "prose" as const }));
	}

	/**
	 * Detect whether `partialText` ends with an active command trigger
	 * (e.g. `#` for tags, `^` for macros). Returns the trigger character
	 * or `null`.
	 *
	 * A trigger is detected when:
	 * 1. The trigger char appears in `partialText`
	 * 2. The text after the last occurrence does NOT contain a space
	 *    (meaning the user is still typing the command name)
	 */
	private detectCommandTrigger(partialText: string): string | null {
		const cellToken = this.profile.cellCommandToken || ":";
		const triggers = [this.profile.tagToken, cellToken];
		if (this.profile.macroStartToken) {
			triggers.push(this.profile.macroStartToken);
		}
		if (this.profile.variableStartToken) {
			triggers.push(this.profile.variableStartToken);
		}
		triggers.push("@");
		let bestTrigger: string | null = null;
		let bestIdx = -1;
		for (const trigger of triggers) {
			const cellToken = this.profile.cellCommandToken || ":";
			if (
				trigger === cellToken &&
				partialText.trimStart().startsWith(cellToken)
			) {
				bestTrigger = trigger;
				bestIdx = partialText.indexOf(trigger);
				continue;
			}
			const idx = partialText.lastIndexOf(trigger);
			if (idx > bestIdx) {
				const afterTrigger = partialText.slice(idx + trigger.length);
				if (!afterTrigger.includes(" ")) {
					bestTrigger = trigger;
					bestIdx = idx;
				}
			}
		}
		return bestTrigger;
	}

	/**
	 * Convert a `CommandAutocompleteSuggestion` to `AutocompleteSuggestion`
	 * format (Option A) so it can be merged into the unified suggestion list
	 * without changing the public return type of `suggestAutocomplete()`.
	 */
	private toAutocompleteSuggestion(
		s: CommandAutocompleteSuggestion,
	): AutocompleteSuggestion {
		return {
			kind: s.kind === "slash_command" ? "cell_command" : s.kind,
			templateId: `command:${s.kind}`,
			slotName: s.label,
			triggerPattern: this.profile.tagToken,
			insertText: s.insertText,
			cursorOffset: s.cursorOffset ?? s.insertText.length,
			targetSchema: s.targetSchema,
			rankScore: s.rankScore,
		};
	}

	/**
	 * Update the rolling buffer of recent `targetSchema` values from parsed items.
	 * Keeps at most `MAX_RECENT_SCHEMAS` entries, newest first.
	 */
	private updateRecentTargetSchemas(items: ParsedItem[]): void {
		const schemas = items.map((item) => item.targetSchema);
		this.recentTargetSchemas = [...schemas, ...this.recentTargetSchemas].slice(
			0,
			CdslParser.MAX_RECENT_SCHEMAS,
		);
	}

	async preview(
		text: string,
		context?: StopWordContext,
		historyStore?: ParsedCellHistoryStore,
		routingContext?: {
			targetSchema?: string | null;
			resolvedSection?: string | null;
		},
	): Promise<ParserPreviewResult[]> {
		const sessionId = (context as any)?.sessionId || "default_session";
		const cleanText = text;
		const expanded = await this.preprocessor.expandMacros(cleanText);
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
				routingContext,
			);
		}
		return this.previewWithStopWordParser(
			expanded,
			effectiveStopWordParser,
			context,
			historyStore,
			routingContext,
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

	async parseDetailed(
		text: string,
		context?: StopWordContext,
		routingContext?: {
			targetSchema?: string | null;
			resolvedSection?: string | null;
		},
	): Promise<ClinicalParseResult> {
		const sessionId = (context as any)?.sessionId || "default_session";
		const cleanText = text;
		const expanded = await this.preprocessor.expandMacros(cleanText);
		const effectiveStopWordParser = this.stopWordParser;
		if (!effectiveStopWordParser && this.stopWordStore && context) {
			const dynamicParser = await StopWordParser.fromStore(
				this.stopWordStore,
				context,
			);
			const result = await this.parseWithStopWordParser(
				expanded,
				dynamicParser,
				context,
				undefined,
				expanded,
				routingContext,
			);
			this.updateRecentTargetSchemas(result.items);
			return result;
		}
		const result = await this.parseWithStopWordParser(
			expanded,
			effectiveStopWordParser,
			context,
			undefined,
			expanded,
			routingContext,
		);
		this.updateRecentTargetSchemas(result.items);
		return result;
	}

	async parse(
		text: string,
		context?: StopWordContext,
		routingContext?: {
			targetSchema?: string | null;
			resolvedSection?: string | null;
		},
	): Promise<ParsedItem[]> {
		const result = await this.parseDetailed(text, context, routingContext);
		return result.items;
	}

	async parseWithHistoryDetailed(
		text: string,
		context?: StopWordContext,
		historyStore?: ParsedCellHistoryStore,
		routingContext?: {
			targetSchema?: string | null;
			resolvedSection?: string | null;
		},
	): Promise<ClinicalParseResult> {
		const sessionId = (context as any)?.sessionId || "default_session";
		const cleanText = text;
		const expanded = await this.preprocessor.expandMacros(cleanText);
		const effectiveStopWordParser = this.stopWordParser;
		if (!effectiveStopWordParser && this.stopWordStore && context) {
			const dynamicParser = await StopWordParser.fromStore(
				this.stopWordStore,
				context,
			);
			const result = await this.parseWithStopWordParser(
				expanded,
				dynamicParser,
				context,
				historyStore,
				expanded,
				routingContext,
			);
			this.updateRecentTargetSchemas(result.items);
			return result;
		}
		const result = await this.parseWithStopWordParser(
			expanded,
			effectiveStopWordParser,
			context,
			historyStore,
			expanded,
			routingContext,
		);
		this.updateRecentTargetSchemas(result.items);
		return result;
	}

	async parseWithHistory(
		text: string,
		context?: StopWordContext,
		historyStore?: ParsedCellHistoryStore,
		routingContext?: {
			targetSchema?: string | null;
			resolvedSection?: string | null;
		},
	): Promise<ParsedItem[]> {
		const result = await this.parseWithHistoryDetailed(
			text,
			context,
			historyStore,
			routingContext,
		);
		return result.items;
	}

	private async previewWithStopWordParser(
		text: string,
		effectiveStopWordParser: StopWordParser | undefined,
		context?: StopWordContext,
		historyStore?: ParsedCellHistoryStore,
		routingContext?: {
			targetSchema?: string | null;
			resolvedSection?: string | null;
		},
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

			const state = await this.segmentProcessor.processSegment(
				trimmed,
				effectiveStopWordParser,
				context,
				routingContext,
			);
			if (!state) continue;

			for (const parser of state.parsersToRun) {
				const allowedNamespaces =
					this.profile.schemaNamespaces?.[parser.targetSchema.toLowerCase()] ||
					undefined;
				if (parser.preview) {
					const preview = await parser.preview({
						tag: state.tag,
						content: state.content,
						dictionaryStore: this.dictionaryStore,
						conceptDefaultsStore: this.conceptDefaultsStore,
						attributeRules: this.getEffectiveAttributeRules(),
						evaluatorRules: this.profile.evaluatorRules,
						termTokenizer: this.profile.termTokenizer,
						allowedNamespaces,
						preparsedContext: state.preparsedContext,
						historyStore,
					});
					results.push({
						targetSchema: parser.targetSchema,
						deterministic: preview.deterministic,
						learned: preview.learned,
					});
				} else {
					const parsed = await parser.parse({
						tag: state.tag,
						content: state.content,
						dictionaryStore: this.dictionaryStore,
						conceptDefaultsStore: this.conceptDefaultsStore,
						attributeRules: this.getEffectiveAttributeRules(),
						evaluatorRules: this.profile.evaluatorRules,
						termTokenizer: this.profile.termTokenizer,
						allowedNamespaces,
						preparsedContext: state.preparsedContext,
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
		routingContext?: {
			targetSchema?: string | null;
			resolvedSection?: string | null;
		},
	): Promise<ClinicalParseResult> {
		let items: ParsedItem[] = [];
		const allScoredItems: ScoredParsedItem[] = [];
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
			const state = await this.segmentProcessor.processSegment(
				trimmed,
				effectiveStopWordParser,
				context,
				routingContext,
			);
			if (!state) continue;

			const candidateItems: ParsedItem[] = [];
			// Dispatch selected parsers against the full span
			for (const parser of state.parsersToRun) {
				const allowedNamespaces =
					this.profile.schemaNamespaces?.[parser.targetSchema.toLowerCase()] ||
					undefined;
				const parsed =
					historyStore && parser.preview
						? await parser.preview({
								tag: state.tag,
								content: state.content,
								dictionaryStore: this.dictionaryStore,
								conceptDefaultsStore: this.conceptDefaultsStore,
								attributeRules: this.getEffectiveAttributeRules(),
								evaluatorRules: this.profile.evaluatorRules,
								termTokenizer: this.profile.termTokenizer,
								allowedNamespaces,
								preparsedContext: state.preparsedContext,
								historyStore,
							})
						: undefined;

				const learnedCandidate = parsed?.learned[0] || parsed?.deterministic[0];
				const deterministic = await parser.parse({
					tag: state.tag,
					content: state.content,
					dictionaryStore: this.dictionaryStore,
					conceptDefaultsStore: this.conceptDefaultsStore,
					attributeRules: this.getEffectiveAttributeRules(),
					evaluatorRules: this.profile.evaluatorRules,
					termTokenizer: this.profile.termTokenizer,
					allowedNamespaces,
					preparsedContext: state.preparsedContext,
				});
				const finalItem = learnedCandidate || deterministic;
				if (finalItem) {
					const finalItems = Array.isArray(finalItem) ? finalItem : [finalItem];
					for (const item of finalItems) {
						const requiresConcept = !CdslParser.SCHEMAS_WITHOUT_CONCEPT.has(
							item.targetSchema,
						);
						if (!requiresConcept || item.concept.length > 0) {
							candidateItems.push(item);
						}
					}
				}
			}

			if (candidateItems.length > 0) {
				for (const item of candidateItems) {
					const key = `${item.targetSchema}:${item.concept[0]?.conceptId ?? ""}:${JSON.stringify(item.extractedData)}:segment_${items.length}`;
					if (!seenFinal.has(key)) {
						seenFinal.add(key);
						items.push(item);
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

							// Temporal containment check
							if (anchor.temporalContainment) {
								const tc = anchor.temporalContainment;
								const sourceData = candidateItem.extractedData;
								const targetData = targetItem.extractedData;

								const rangeData =
									tc.sourceRangePath && tc.sourceRangePath.length > 0
										? CdslParser.resolveDeepPath(sourceData, tc.sourceRangePath)
										: sourceData;

								const targetDateStr =
									tc.targetDateTimePath && tc.targetDateTimePath.length > 0
										? CdslParser.resolveDeepPath(
												targetData,
												tc.targetDateTimePath,
											)
										: undefined;

								if (
									!rangeData ||
									(tc.missingDatePolicy === "require" &&
										(targetDateStr === undefined || targetDateStr === null))
								) {
									continue;
								}

								if (
									targetDateStr !== undefined &&
									targetDateStr !== null &&
									typeof targetDateStr === "string"
								) {
									const contained = CdslParser.checkDateInRange(
										targetDateStr,
										rangeData as Record<string, any>,
									);
									if (!contained) {
										continue;
									}
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

				items = items.filter((item) => !anchoredCandidates.has(item));
			} catch (e) {
				console.error("Shared field anchoring failed:", e);
			}
		}

		allScoredItems.sort((a, b) => b.confidenceScore - a.confidenceScore);
		const topConfidence = allScoredItems[0];
		const confidence = topConfidence
			? {
					score: topConfidence.confidenceScore,
					level: parseConfidenceLevel(topConfidence.confidenceScore),
					breakdown: topConfidence.breakdown,
				}
			: undefined;

		return { items, scoredItems: allScoredItems, confidence };
	}

	/**
	 * Resolves a dot-separated path within an object.
	 */
	private static resolveDeepPath(
		obj: Record<string, any>,
		path: string,
	): unknown {
		const parts = path.split(".");
		let current: unknown = obj;
		for (const part of parts) {
			if (current === null || current === undefined) return undefined;
			if (typeof current !== "object") return undefined;
			current = (current as Record<string, unknown>)[part];
		}
		return current;
	}

	/**
	 * Checks whether a date string falls within a ClinicalDateRange structure.
	 * The rangeData is expected to have a `time` object with optional
	 * `startDatetime`/`endDatetime` (each with `assertedTimestampUtc`) and
	 * optional `excludedDatetimes[]` with `time.startDatetime`/`time.endDatetime`.
	 */
	private static checkDateInRange(
		dateStr: string,
		rangeData: Record<string, any>,
	): boolean {
		const time = rangeData?.time;
		if (!time) return true;

		const targetMs = new Date(dateStr).getTime();
		if (Number.isNaN(targetMs)) return true;

		const startIso = time.startDatetime?.assertedTimestampUtc;
		const endIso = time.endDatetime?.assertedTimestampUtc;

		if (startIso && new Date(startIso).getTime() > targetMs) return false;
		if (endIso && new Date(endIso).getTime() < targetMs) return false;

		const excluded = rangeData.excludedDatetimes;
		if (Array.isArray(excluded)) {
			for (const ex of excluded) {
				const exStart = ex?.time?.startDatetime?.assertedTimestampUtc;
				const exEnd = ex?.time?.endDatetime?.assertedTimestampUtc;
				if (exStart && !exEnd) {
					if (new Date(exStart).getTime() === targetMs) return false;
				}
				if (exStart && exEnd) {
					const exStartMs = new Date(exStart).getTime();
					const exEndMs = new Date(exEnd).getTime();
					if (targetMs >= exStartMs && targetMs <= exEndMs) return false;
				}
			}
		}

		return true;
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

		const preparsedContext = this.segmentProcessor.buildPreparsedContext(
			content,
			context,
			overrides,
			"",
			undefined,
		);

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
