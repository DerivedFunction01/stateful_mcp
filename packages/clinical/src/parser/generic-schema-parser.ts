import type { DictionaryStore } from "@stateful-mcp/core";
import type { QuantityCandidate } from "../parser/helpers/measurement-helper";
import type { CodeableConcept } from "../schemas/shared";
import type {
	AttributeParserRule,
	FieldMappingRule,
	ParserDictionaryRule,
	ParserSyntaxProfile,
} from "../store/interfaces";
import type { ParsedCellHistoryStore } from "../store/learning/interfaces";
import { GenericTokenizer } from "./generic-tokenizer";
import type {
	ParsedCandidateEnvelope,
	ParsedItem,
	PreparsedContext,
	SchemaParserOptions,
} from "./schema-parsers";
import { resolveConceptHelper } from "./schema-parsers";

export interface GenericSchemaParserConfig {
	targetSchema: string;
	createRegistry: (attributeRules: AttributeParserRule[]) => FieldMappingRule[];
	router: (
		token: Record<string, any>,
		targetSchema: string,
		profile: any,
		attributeRules?: AttributeParserRule[],
		unmatched?: CodeableConcept[],
	) => Record<string, any>;
	preparsedContextKeys?: string[];
}

export class GenericSchemaParser {
	targetSchema: string;

	constructor(
		targetSchema: string,
		private config: GenericSchemaParserConfig,
	) {
		this.targetSchema = targetSchema;
	}

	async preview(
		_tagOrOptions: string | SchemaParserOptions,
		_content?: string,
		_dictionaryStore?: DictionaryStore,
		_attributeRules?: AttributeParserRule[],
		_evaluatorRules?: ParserDictionaryRule[],
		_termTokenizer?: string,
		_allowedNamespaces?: string[],
		_preparsedContext?: PreparsedContext,
		_historyStore?: ParsedCellHistoryStore,
		_concepts?: CodeableConcept[],
	): Promise<ParsedCandidateEnvelope> {
		let options: SchemaParserOptions;
		if (typeof _tagOrOptions === "object" && _tagOrOptions !== null) {
			options = _tagOrOptions;
		} else {
			options = {
				tag: _tagOrOptions,
				content: _content!,
				dictionaryStore: _dictionaryStore!,
				attributeRules: _attributeRules,
				evaluatorRules: _evaluatorRules,
				termTokenizer: _termTokenizer,
				allowedNamespaces: _allowedNamespaces,
				preparsedContext: _preparsedContext,
				historyStore: _historyStore,
				concepts: _concepts,
			};
		}

		const tag = options.tag;
		const contentVal = options.content;
		const preparsedContextVal = options.preparsedContext;
		const historyStoreVal = options.historyStore;

		const deterministic = await this.parse(options);

		const key = {
			patientId: preparsedContextVal?.patientContext?.patientId,
			patientOrganismType: preparsedContextVal?.patientContext?.organismType,
			patientGender: preparsedContextVal?.patientContext?.gender,
			patientAgeBucket: preparsedContextVal?.patientContext?.ageBucket,
			patientSpeciesBucket: preparsedContextVal?.patientContext?.speciesBucket,
			patientSubBucket: preparsedContextVal?.patientContext?.subBucket,
			patientBucketKey: preparsedContextVal?.patientContext?.bucketKey,
			personnelId: preparsedContextVal?.rankingSignals?.personnelId,
			specialtyId: preparsedContextVal?.rankingSignals?.specialtyId,
			facilityId: preparsedContextVal?.rankingSignals?.facilityId,
			tag,
			targetSchema: this.targetSchema,
			rawText: contentVal,
		};

		const historyRows = historyStoreVal
			? await historyStoreVal.getHistory(key)
			: [];
		const learned = historyRows
			.map((row) => row.parsedItem)
			.filter(
				(item): item is ParsedItem =>
					item !== null && item.targetSchema === this.targetSchema,
			);

		return {
			deterministic: deterministic ? [deterministic] : [],
			learned:
				learned.length > 0 ? learned : deterministic ? [deterministic] : [],
		};
	}

	async parse(
		_tagOrOptions: string | SchemaParserOptions,
		_content?: string,
		_dictionaryStore?: DictionaryStore,
		_attributeRules?: AttributeParserRule[],
		_evaluatorRules?: ParserDictionaryRule[],
		_termTokenizer?: string,
		_allowedNamespaces?: string[],
		_preparsedContext?: PreparsedContext,
		_concepts?: CodeableConcept[],
	): Promise<ParsedItem | null> {
		let options: SchemaParserOptions;
		if (typeof _tagOrOptions === "object" && _tagOrOptions !== null) {
			options = _tagOrOptions;
		} else {
			options = {
				tag: _tagOrOptions,
				content: _content!,
				dictionaryStore: _dictionaryStore!,
				attributeRules: _attributeRules,
				evaluatorRules: _evaluatorRules,
				termTokenizer: _termTokenizer,
				allowedNamespaces: _allowedNamespaces,
				preparsedContext: _preparsedContext,
				concepts: _concepts,
			};
		}

		const tag = options.tag;
		const content = options.content;
		const dictionaryStore = options.dictionaryStore;
		const attributeRules = options.attributeRules;
		const evaluatorRules = options.evaluatorRules;
		const termTokenizer = options.termTokenizer;
		const allowedNamespaces = options.allowedNamespaces;
		const preparsedContext = options.preparsedContext;
		const concepts = options.concepts;

		const attrRules = attributeRules || [];
		const evalRules = evaluatorRules || [];

		let token: Record<string, any> | null = null;

		if (preparsedContext) {
			token = this.buildTokenFromPreparsedContext(
				content,
				preparsedContext,
				attrRules,
				this.config.preparsedContextKeys,
			);
		} else {
			const genericToken = GenericTokenizer.tokenize(
				content,
				attrRules,
				evalRules,
			);
			token = {
				anchorText: genericToken.anchorText,
				namedGroups: genericToken.namedGroups,
				attributes: genericToken.attributes,
			};
		}

		if (!token || !token.anchorText) return null;

		const concept =
			concepts ||
			(await resolveConceptHelper(
				token.anchorText,
				dictionaryStore,
				termTokenizer,
				allowedNamespaces,
			));

		const unmatched: CodeableConcept[] = concept;

		const profile = preparsedContext?.profile as
			| Pick<ParserSyntaxProfile, "schemaDefaults" | "defaultsStrategy">
			| undefined;

		const registry = this.config.createRegistry(attrRules);
		const extractedData = this.config.router(
			token,
			this.targetSchema,
			profile,
			attrRules,
			unmatched,
		);

		const attributes: Record<string, any> = {};
		if (token.attributes) {
			for (const [key, value] of Object.entries(token.attributes)) {
				if (value !== undefined && value !== null) {
					attributes[key] = value;
				}
			}
		}

		return {
			targetSchema: this.targetSchema,
			attributes,
			concept: unmatched.length > 0 ? [unmatched[0]] : [],
			rawText: `${tag} ${content}`,
			tag,
			extractedData,
		} as ParsedItem;
	}

	private buildTokenFromPreparsedContext(
		content: string,
		preparsedContext: PreparsedContext,
		attributeRules: AttributeParserRule[],
		preparsedContextKeys?: string[],
	): Record<string, any> {
		const token: Record<string, any> = {
			anchorText: content.trim(),
			namedGroups: {},
			attributes: preparsedContext.attributes || {},
		};

		const keys = preparsedContextKeys || [];

		if (keys.includes("measurement")) {
			const allCandidates: QuantityCandidate[] = [];
			if (preparsedContext.candidates) {
				for (const bucket of Object.values(preparsedContext.candidates)) {
					allCandidates.push(...bucket);
				}
			}
			if (preparsedContext.looseCandidates) {
				allCandidates.push(...preparsedContext.looseCandidates);
			}
			allCandidates.sort((a, b) => a.tokenStart - b.tokenStart);

			if (allCandidates.length > 0) {
				const best = allCandidates[0];
				if (best) {
					token.namedGroups.quantity = {
						quantity: best.magnitude.toString(),
						unit: best.rawUnit || undefined,
					};
					if (best.statistics) {
						token.namedGroups.statistics = best.statistics;
					}
				}
			}
		}

		if (keys.includes("timeSpan")) {
			if (preparsedContext.timeCandidates.length > 0) {
				const best = preparsedContext.timeCandidates[0];
				if (best) {
					token.namedGroups.time = {
						multiplier: best.magnitude.toString(),
						unit: best.rawUnit || undefined,
					};
				}
			}
		}

		if (keys.includes("frequency") && preparsedContext.frequency) {
			const freq = preparsedContext.frequency;
			if (freq.isPrn) {
				token.attributes.frequency_prn = "true";
			}
			if (freq.eventAnchor) {
				token.attributes.frequency_event_anchor = freq.eventAnchor;
			}
			if (freq.interval) {
				token.namedGroups.frequency_shorthand = {
					frequency_shorthand: this.resolveShorthandFromInterval(
						freq.interval.multiplier,
						freq.interval.unit,
					),
				};
			}
			if (freq.rate) {
				token.namedGroups.frequency_details = {
					multiplier: freq.rate.times.toString(),
					unit: freq.rate.period,
				};
			}
			if (freq.interval && !freq.rate) {
				token.namedGroups.frequency_details = {
					multiplier: freq.interval.multiplier.toString(),
					unit: freq.interval.unit,
				};
			}
		}

		if (
			keys.includes("anatomy") &&
			preparsedContext.anatomyCandidates?.length
		) {
			token.namedGroups.anatomy = preparsedContext.anatomyCandidates.map(
				(candidate) => ({
					anatomy: candidate.raw,
					laterality: candidate.laterality,
					depthIndex: candidate.depthIndex,
				}),
			);
		}

		return token;
	}

	private resolveShorthandFromInterval(
		multiplier: number,
		unit: string,
	): string | undefined {
		switch (unit) {
			case "hour":
				if (multiplier === 12) return "BID";
				if (multiplier === 8) return "TID";
				if (multiplier === 6) return "QID";
				break;
			case "day":
				if (multiplier === 1) return "QD";
				break;
		}
		return undefined;
	}
}
