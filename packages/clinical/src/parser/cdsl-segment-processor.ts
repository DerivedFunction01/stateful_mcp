import type { DictionaryStore } from "@stateful-mcp/core";
import type { CodeableConcept } from "../schemas/shared";
import type {
	AttributeParserRule,
	ConceptFieldRule,
	ConceptFieldStore,
	ParserSyntaxProfile,
	StopWordContext,
} from "../store/interfaces";
import { getCompiledRegex } from "./_compiled-regex";
import { AnatomyTokenizer } from "./helpers/anatomy-helper";
import { FrequencyHelper } from "./helpers/frequency-helper";
import {
	type QuantityCandidate,
	QuantityTokenizer,
} from "./helpers/measurement-helper";
import {
	type PreparsedContext,
	type RankingSignal,
	resolveMultiConceptHelper,
	type SchemaParser,
	schemaParserRegistry,
} from "./schema-parsers";
import type { StopWordParser } from "./stop-word-parser";
import { NumberWordNormalizer } from "./utils/number-word-normalizer";

export interface SegmentParseState {
	tag: string;
	content: string;
	preparsedContext: PreparsedContext;
	conceptFieldRules: ConceptFieldRule[];
	mappedParser: SchemaParser | undefined;
	parsersToRun: SchemaParser[];
}

export interface RoutingContext {
	targetSchema?: string | null;
	resolvedSection?: string | null;
}

export class SegmentProcessor {
	constructor(
		private profile: ParserSyntaxProfile,
		private attributeRules: AttributeParserRule[],
		private conceptFieldStore: ConceptFieldStore | undefined,
		private dictionaryStore: DictionaryStore,
	) {}

	async processSegment(
		text: string,
		effectiveStopWordParser: StopWordParser | undefined,
		context?: StopWordContext,
		routingContext?: RoutingContext,
	): Promise<SegmentParseState | null> {
		const { tag, content } = this.extractTag(text);
		if (!content) {
			return null;
		}

		if (this.isStopWordGated(content, tag, effectiveStopWordParser)) {
			return null;
		}

		const preparsedContext = this.buildPreparsedContext(
			content,
			context,
			undefined,
			tag,
			routingContext,
		);

		// Resolve concepts for concept-driven dispatch
		const resolvedConcepts = await this.resolveSegmentConcepts(content);

		// Look up ConceptFieldRule[] for resolved conceptIds
		const conceptFieldRules =
			await this.resolveConceptFieldRules(resolvedConcepts);

		// Resolve tag to a schema parser
		let mappedParser: SchemaParser | undefined;
		if (routingContext?.targetSchema) {
			mappedParser = this.resolveParserBySchema(routingContext.targetSchema);
		} else {
			mappedParser = this.resolveMappedParser(tag);
		}

		// Build parsersToRun from tag + concept routing
		const parsersToRun = this.resolveParsersToRun(
			tag,
			conceptFieldRules,
			mappedParser,
			routingContext?.targetSchema,
		);

		return {
			tag,
			content,
			preparsedContext,
			conceptFieldRules,
			mappedParser,
			parsersToRun,
		};
	}

	public extractTag(content: string): { tag: string; content: string } {
		let tag = "";
		let cleanContent = content;
		const escTagToken = this.profile.tagToken.replace(
			/[-/\\^$*+?.()|[\]{}]/g,
			"\\$&",
		);
		const tagRegex = new RegExp(
			`(?:\\s|^)(${escTagToken}[a-zA-Z0-9_-]+)(?:\\s|$)`,
		);
		const tagMatch = cleanContent.match(tagRegex);
		if (tagMatch) {
			tag = tagMatch[1] ?? "";
			cleanContent = cleanContent.replace(tagMatch[0], " ").trim();
			cleanContent = cleanContent.replace(/\s+/g, " ");
		}
		return { tag, content: cleanContent };
	}

	private isStopWordGated(
		content: string,
		tag: string,
		stopWordParser: StopWordParser | undefined,
	): boolean {
		if (!tag && stopWordParser) {
			const words = content.split(/\s+/).filter(Boolean);
			let stopWordCount = 0;
			for (const w of words) {
				if (stopWordParser.isStopWord(w)) {
					stopWordCount++;
				}
			}
			if (
				words.length > 0 &&
				stopWordCount / words.length > (this.profile.stopWordThreshold ?? 0.6)
			) {
				return true;
			}
		}
		return false;
	}

	public buildPreparsedContext(
		content: string,
		context?: StopWordContext,
		attributeOverrides?: Record<string, any>,
		tag: string = "",
		routingContext?: RoutingContext,
	): PreparsedContext {
		const attrRules = this.attributeRules;
		const numberWordConfig = this.profile.numberWordConfig;
		const normalizer = new NumberWordNormalizer(numberWordConfig || null);
		const { normalizedText } = normalizer.normalize(content);
		const tokenizationText = normalizedText || content;
		const candidates = QuantityTokenizer.tokenize(tokenizationText, attrRules);
		const frequency = FrequencyHelper.parse(
			content,
			attrRules || [],
			this.profile.evaluatorRules || [],
		);
		const anatomyCandidates = AnatomyTokenizer.tokenize(content, attrRules);

		const attributes: Record<string, string> = { ...attributeOverrides };
		const rules = [...attrRules].sort((a, b) => {
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

		const candidatesByAnchor: Record<string, QuantityCandidate[]> = {};
		const looseCandidates: QuantityCandidate[] = [];
		const timeCandidates: QuantityCandidate[] = [];

		for (const candidate of candidates) {
			const unitAnchor = candidate.sourceRule?.unitAnchor;
			if (unitAnchor) {
				if (!candidatesByAnchor[unitAnchor]) {
					candidatesByAnchor[unitAnchor] = [];
				}
				candidatesByAnchor[unitAnchor].push(candidate);
			} else if (candidate.sourceRule?.targetField === "time_unit") {
				timeCandidates.push(candidate);
			} else {
				looseCandidates.push(candidate);
			}
		}

		return {
			rawText: content,
			normalizedText: normalizedText !== content ? normalizedText : undefined,
			candidates: candidatesByAnchor,
			looseCandidates,
			timeCandidates,
			anatomyCandidates,
			frequency,
			attributes,
			profile: this.profile,
			rankingSignals: buildRankingSignals(context, tag),
		};
	}

	private async resolveSegmentConcepts(
		content: string,
		allowedNamespaces?: string[],
	): Promise<CodeableConcept[]> {
		return resolveMultiConceptHelper(
			content,
			this.dictionaryStore,
			this.profile.termTokenizer,
			allowedNamespaces,
		);
	}

	private async resolveConceptFieldRules(
		concepts: CodeableConcept[],
	): Promise<ConceptFieldRule[]> {
		const conceptFieldRules: ConceptFieldRule[] = [];
		if (this.conceptFieldStore && concepts.length > 0) {
			const allRules = await this.conceptFieldStore.list();
			const matchedConceptIds = new Set(concepts.map((c) => c.conceptId));
			for (const rule of allRules) {
				if (matchedConceptIds.has(rule.conceptId)) {
					conceptFieldRules.push(rule);
				}
			}
		}
		return conceptFieldRules;
	}

	private resolveMappedParser(tag: string): SchemaParser | undefined {
		if (!tag) return undefined;

		const tagToken = this.profile.tagToken;
		let cleanKey = tag.startsWith(tagToken)
			? tag.substring(tagToken.length).toLowerCase()
			: tag.toLowerCase();

		if (this.profile.tagMappings && this.profile.tagMappings[cleanKey]) {
			cleanKey = this.profile.tagMappings[cleanKey]!.toLowerCase();
		}

		let mappedParser = schemaParserRegistry.get(cleanKey);
		if (!mappedParser) {
			for (const p of schemaParserRegistry.values()) {
				if (p.targetSchema.toLowerCase() === cleanKey) {
					mappedParser = p;
					break;
				}
			}
		}
		return mappedParser;
	}

	private resolveParserBySchema(
		targetSchema: string,
	): SchemaParser | undefined {
		let mappedParser = schemaParserRegistry.get(targetSchema.toLowerCase());
		if (!mappedParser) {
			for (const p of schemaParserRegistry.values()) {
				if (p.targetSchema.toLowerCase() === targetSchema.toLowerCase()) {
					mappedParser = p;
					break;
				}
			}
		}
		return mappedParser;
	}

	private resolveParsersToRun(
		tag: string,
		conceptFieldRules: ConceptFieldRule[],
		mappedParser: SchemaParser | undefined,
		resolvedSchema?: string | null,
	): SchemaParser[] {
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
		if (parsersToRun.length === 0 && !resolvedSchema) {
			for (const p of Array.from(schemaParserRegistry.values())) {
				parsersToRun.push(p);
			}
		}
		return parsersToRun;
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
