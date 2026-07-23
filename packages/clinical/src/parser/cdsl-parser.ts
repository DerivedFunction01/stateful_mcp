import type { DictionaryStore } from "@stateful-mcp/core";
import type {
	ParserConceptDefaultStore,
	ParserSyntaxProfile,
	StopWordContext,
	StopWordStore,
} from "../store/interfaces";
import { SEED_PARSER_PROFILES } from "../store/defaults";
import { StopWordParser } from "./stop-word-parser";
import {
	CANONICAL_TAGS as IMP_CANONICAL_TAGS,
	type ParsedItem as IMP_ParsedItem,
	type BaseParsedItem as IMP_BaseParsedItem,
	type ParsedVitalsItem as IMP_ParsedVitalsItem,
	type ParsedObservationItem as IMP_ParsedObservationItem,
	type ParsedMedicationItem as IMP_ParsedMedicationItem,
	schemaParserRegistry,
} from "./schema-parsers";

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
			(p) => p.profileId === "default"
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
	async parse(
		text: string,
		context?: StopWordContext,
	): Promise<ParsedItem[]> {
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
					const parsed = await this.parseSegment(tag, content, effectiveStopWordParser);
					if (parsed) {
						items.push(parsed);
					}
				}
			} else {
				// Tagless parsing fallback: try to guess/infer target schema from the first word
				const firstSpace = trimmed.indexOf(" ");
				const firstWord =
					firstSpace === -1 ? trimmed : trimmed.substring(0, firstSpace);

				if (effectiveStopWordParser?.isStopWord(firstWord)) {
					continue;
				}

				// Collect namespaces from the profile's schemaNamespaces configuration.
				// No defaults are assumed here; if the profile does not define any,
				// tagless resolution will not find any namespaces to search.
				const namespacesToSearch: string[] = [];
				if (this.profile.schemaNamespaces) {
					const allNs = new Set<string>();
					for (const nsList of Object.values(this.profile.schemaNamespaces)) {
						for (const ns of nsList) allNs.add(ns);
					}
					namespacesToSearch.push(...Array.from(allNs));
				}

				// Resolve the first word across namespaces
				let resolvedConcept: any = null;
				for (const ns of namespacesToSearch) {
					const res = await this.dictionaryStore.search(firstWord, ns, 1);
					if (res && res.length > 0 && res[0]) {
						resolvedConcept = res[0];
						break;
					}
				}

				let targetSchema = "";
				if (resolvedConcept) {
					if (this.conceptDefaultsStore) {
						// Guess schema based on concept default configurations
						for (const schema of Object.values(CANONICAL_TAGS)) {
							const defaults = await this.conceptDefaultsStore.get(
								resolvedConcept.id,
								schema,
							);
							if (defaults) {
								targetSchema = schema;
								break;
							}
						}
					}

					// If still no schema default found, guess based on namespace configuration
					if (!targetSchema) {
						if (this.profile.schemaNamespaces) {
							for (const [schemaKey, nsList] of Object.entries(
								this.profile.schemaNamespaces,
							)) {
								if (nsList.includes(resolvedConcept.namespaceCode)) {
									for (const schema of Object.values(CANONICAL_TAGS)) {
										if (
											schema.toLowerCase() === schemaKey.toLowerCase() ||
											schemaKey.toLowerCase().includes(schema.toLowerCase())
										) {
											targetSchema = schema;
											break;
										}
									}
									if (targetSchema) break;
								}
							}
						}

						if (!targetSchema) {
							if (resolvedConcept.namespaceCode === "LOINC") {
								targetSchema = CANONICAL_TAGS.VITALS;
							} else if (resolvedConcept.namespaceCode === "RxNorm") {
								targetSchema = CANONICAL_TAGS.MEDICATION;
							} else {
								targetSchema = CANONICAL_TAGS.OBSERVATION;
							}
						}
					}
				}

				if (targetSchema) {
					const parsed = await this.parseSegment(
						this.profile.tagToken + targetSchema.toLowerCase(),
						trimmed,
						effectiveStopWordParser,
					);
					if (parsed) {
						items.push(parsed);
					}
				}
			}
		}

		return items;
	}

	private async parseSegment(
		tag: string,
		content: string,
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
			);
		}
		return null;
	}
}
