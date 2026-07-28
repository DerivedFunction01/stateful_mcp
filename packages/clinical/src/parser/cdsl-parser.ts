import type { DictionaryStore } from "@stateful-mcp/core";
import type {
	ConceptFieldRule,
	ConceptFieldStore,
	ParserConceptDefaultStore,
	ParserProfileStore,
	ParserSyntaxProfile,
	StopWordContext,
	StopWordStore,
} from "../store/interfaces";
import type { ParsedCellHistoryStore } from "../store/learning/interfaces";
import type { ProseParserTemplateStore } from "../store/reference/prose-parser-templates/interfaces";
import {
	buildCalendarDateRules,
	buildNumericFieldRules,
} from "../store/rules-builder";
import { getCompiledRegex } from "./_compiled-regex";
import { FrequencyHelper } from "./helpers/frequency-helper";
import { QuantityTokenizer } from "./helpers/measurement-helper";
import { ProseParser } from "./prose-parser";
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

interface ParserPreviewResult extends ParsedCandidateEnvelope {
	targetSchema: string;
}

export class CdslParser {
	private stopWordParser: StopWordParser | undefined;
	private stopWordStore: StopWordStore | undefined;
	private attributeRules: import("../store/interfaces").AttributeParserRule[];

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
		);
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

	async parseWithHistory(
		text: string,
		context?: StopWordContext,
		historyStore?: ParsedCellHistoryStore,
	): Promise<ParsedItem[]> {
		const effectiveStopWordParser = this.stopWordParser;
		if (!effectiveStopWordParser && this.stopWordStore && context) {
			const dynamicParser = await StopWordParser.fromStore(
				this.stopWordStore,
				context,
			);
			return this.parseWithStopWordParser(
				text,
				dynamicParser,
				context,
				historyStore,
			);
		}
		return this.parseWithStopWordParser(
			text,
			effectiveStopWordParser,
			context,
			historyStore,
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
		const segments = remainingText.split(this.profile.stateDelimiter);

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
		historyStore?: ParsedCellHistoryStore,
	): Promise<ParsedItem[]> {
		const items: ParsedItem[] = [];

		// 1. Run ProseParser if template store is configured
		const { proseItems, remainingText, remnants } = await this.runProseParser(
			text,
			context,
			historyStore,
		);
		items.push(...proseItems);
		items.push(...remnants);

		// 2. Parse remaining segments
		const segments = remainingText.split(this.profile.stateDelimiter);
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
						? await parser.preview(
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
							)
						: undefined;

				const learnedCandidate = parsed?.learned[0] || parsed?.deterministic[0];
				const deterministic = await parser.parse(
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
				const finalItem = learnedCandidate || deterministic;

				if (finalItem) {
					const requiresConcept = !CdslParser.SCHEMAS_WITHOUT_CONCEPT.has(
						finalItem.targetSchema,
					);
					if (!requiresConcept || finalItem.concept.length > 0) {
						const key = `${finalItem.targetSchema}:${finalItem.concept[0]?.conceptId ?? ""}`;
						if (!seenFinal.has(key)) {
							seenFinal.add(key);
							items.push(finalItem);
						}
					}
				}
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

			const result = await parser.parse(
				"",
				content,
				this.dictionaryStore,
				this.conceptDefaultsStore,
				this.getEffectiveAttributeRules(),
				this.profile.evaluatorRules,
				this.profile.termTokenizer,
				defaultNamespace,
				preparsedContext,
				this.conceptFieldStore,
				concepts,
			);

			if (result) {
				result.extractedData = {
					...result.extractedData,
					...overrides,
				};
				items.push(result);
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
