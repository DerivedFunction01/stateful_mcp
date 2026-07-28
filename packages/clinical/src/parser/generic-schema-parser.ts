import type { DictionaryStore } from "@stateful-mcp/core";
import type { CodeableConcept } from "../schemas/shared";
import type {
	AttributeParserRule,
	ConceptFieldStore,
	ParserConceptDefaultStore,
	ParserDictionaryRule,
	ParserSyntaxProfile,
} from "../store/interfaces";
import type { ParsedCellHistoryStore } from "../store/learning/interfaces";
import { GenericTokenizer } from "./generic-tokenizer";
import type {
	ParsedCandidateEnvelope,
	ParsedItemUnion,
	PreparsedContext,
} from "./schema-parsers";
import { resolveConceptHelper } from "./schema-parsers";

export interface GenericSchemaParserConfig {
	targetSchema: string;
	createRegistry: (
		attributeRules: AttributeParserRule[],
	) => import("../store/interfaces").FieldMappingRule[];
	router: (
		token: Record<string, any>,
		conceptDefaults: Record<string, any> | null,
		targetSchema: string,
		profile: any,
		attributeRules?: AttributeParserRule[],
		conceptFields?: Record<string, CodeableConcept[]>,
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
		const deterministic = await this.parse(
			tag,
			content,
			dictionaryStore,
			conceptDefaultsStore,
			attributeRules,
			evaluatorRules,
			termTokenizer,
			allowedNamespaces,
			preparsedContext,
			conceptFieldStore,
			concepts,
		);

		const key = {
			patientId: preparsedContext?.patientContext?.patientId,
			patientOrganismType: preparsedContext?.patientContext?.organismType,
			patientGender: preparsedContext?.patientContext?.gender,
			patientAgeBucket: preparsedContext?.patientContext?.ageBucket,
			patientSpeciesBucket: preparsedContext?.patientContext?.speciesBucket,
			patientSubBucket: preparsedContext?.patientContext?.subBucket,
			patientBucketKey: preparsedContext?.patientContext?.bucketKey,
			personnelId: preparsedContext?.rankingSignals?.personnelId,
			specialtyId: preparsedContext?.rankingSignals?.specialtyId,
			facilityId: preparsedContext?.rankingSignals?.facilityId,
			tag,
			targetSchema: this.targetSchema,
			rawText: content,
		};

		const historyRows = historyStore ? await historyStore.getHistory(key) : [];
		const learned = historyRows
			.map((row) => row.parsedItem)
			.filter(
				(item): item is ParsedItemUnion =>
					item !== null && item.targetSchema === this.targetSchema,
			);

		return {
			deterministic: deterministic ? [deterministic] : [],
			learned:
				learned.length > 0 ? learned : deterministic ? [deterministic] : [],
		};
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
	): Promise<ParsedItemUnion | null> {
		const attrRules = attributeRules || [];
		const evalRules = evaluatorRules || [];

		let token: Record<string, any> | null = null;

		if (preparsedContext) {
			token = this.buildTokenFromPreparsedContext(
				content,
				preparsedContext,
				attrRules,
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

		const conceptFields: Record<string, CodeableConcept[]> = {};
		const unmatched: CodeableConcept[] = [];

		if (conceptFieldStore && concept.length > 0) {
			const rules = await conceptFieldStore.listBySchema(this.targetSchema);
			const ruleMap = new Map(rules.map((r) => [r.conceptId, r]));
			for (const c of concept) {
				if (!c.conceptId) {
					unmatched.push(c);
					continue;
				}
				const rule = ruleMap.get(c.conceptId);
				if (rule) {
					const field = rule.fieldPath;
					if (!conceptFields[field]) {
						conceptFields[field] = [];
					}
					conceptFields[field].push(c);
				} else {
					unmatched.push(c);
				}
			}
		} else {
			unmatched.push(...concept);
		}

		let conceptDefaults: Record<string, any> | null = null;
		const primaryConcept = conceptFields.concept?.[0] || unmatched[0];
		if (primaryConcept?.conceptId && conceptDefaultsStore) {
			const defaults = await conceptDefaultsStore.get(
				primaryConcept.conceptId,
				this.targetSchema,
			);
			if (defaults) {
				conceptDefaults = defaults.defaultProperties;
			}
		}

		const profile = preparsedContext?.profile as
			| Pick<ParserSyntaxProfile, "schemaDefaults" | "defaultsStrategy">
			| undefined;

		const registry = this.config.createRegistry(attrRules);
		const extractedData = this.config.router(
			token,
			conceptDefaults,
			this.targetSchema,
			profile,
			attrRules,
			conceptFields,
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
			conceptFields:
				Object.keys(conceptFields).length > 0 ? conceptFields : undefined,
		} as ParsedItemUnion;
	}

	private buildTokenFromPreparsedContext(
		content: string,
		preparsedContext: PreparsedContext,
		attributeRules: AttributeParserRule[],
	): Record<string, any> {
		const token: Record<string, any> = {
			anchorText: content.trim(),
			namedGroups: {},
			attributes: preparsedContext.attributes || {},
		};

		if (
			preparsedContext.measurement &&
			preparsedContext.measurement.length > 0
		) {
			const best = preparsedContext.measurement[0];
			if (best) {
				token.namedGroups.quantity = {
					quantity: best.magnitude.toString(),
					unit: best.rawUnit || undefined,
				};
			}
		}

		if (preparsedContext.timeSpan && preparsedContext.timeSpan.length > 0) {
			const best = preparsedContext.timeSpan[0];
			if (best) {
				token.namedGroups.time = {
					multiplier: best.magnitude.toString(),
					unit: best.rawUnit || undefined,
				};
			}
		}

		if (preparsedContext.frequency) {
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
