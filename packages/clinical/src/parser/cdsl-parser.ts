import type { DictionaryStore } from "@stateful-mcp/core";
import type { ParserSyntaxProfile, AttributeParserRule } from "../store/interfaces";

export const CANONICAL_TAGS = {
	VITALS: "VitalsMeasurementEvent",
	OBSERVATION: "ObservationEvent",
	MEDICATION: "MedicationOrderObject",
} as const;

export interface ParsedItem {
	tag: string;
	anchorText: string;
	conceptId?: string;
	display: string;
	value?: number | string;
	unit?: string;
	severity?: string;
	certainty?: string;
	status?: string;
	route?: string;
	frequency?: string;
	duration?: string;
	targetSchema: string;
	rawText: string;
}

const DEFAULT_ATTRIBUTE_RULES: AttributeParserRule[] = [
	{
		targetField: "certainty",
		targetValue: "refuted",
		regexPatterns: ["\\bdenies\\b", "\\bdeny\\b", "\\bno\\b"],
		isCaseInsensitive: true,
	},
	{
		targetField: "status",
		targetValue: "resolved",
		regexPatterns: ["\\bdenies\\b", "\\bdeny\\b", "\\bno\\b", "\\bresolved\\b"],
		isCaseInsensitive: true,
	},
	{
		targetField: "severity",
		targetValue: "none",
		regexPatterns: ["\\bdenies\\b", "\\bdeny\\b", "\\bno\\b"],
		isCaseInsensitive: true,
	},
	{
		targetField: "severity",
		targetValue: "severe",
		regexPatterns: ["\\bsevere\\b"],
		isCaseInsensitive: true,
	},
	{
		targetField: "severity",
		targetValue: "mild",
		regexPatterns: ["\\bmild\\b"],
		isCaseInsensitive: true,
	},
	{
		targetField: "severity",
		targetValue: "moderate",
		regexPatterns: ["\\bmoderate\\b"],
		isCaseInsensitive: true,
	},
	{
		targetField: "route",
		targetValue: "INTRAVENOUS",
		regexPatterns: ["\\bintravenous\\b", "\\biv\\b"],
		isCaseInsensitive: true,
	},
	{
		targetField: "route",
		targetValue: "INHALATION",
		regexPatterns: ["\\binhalation\\b", "\\binhaled\\b"],
		isCaseInsensitive: true,
	},
	{
		targetField: "frequency",
		targetValue: "QD",
		regexPatterns: ["\\bqd\\b", "\\bdaily\\b"],
		isCaseInsensitive: true,
	},
	{
		targetField: "frequency",
		targetValue: "PRN",
		regexPatterns: ["\\bprn\\b", "\\bas needed\\b"],
		isCaseInsensitive: true,
	},
];

export class CdslParser {
	constructor(
		private dictionaryStore: DictionaryStore,
		private profile: ParserSyntaxProfile = {
			profileId: "default",
			personnelId: "system",
			tagToken: "#",
			stateDelimiter: "||",
			stateStartDelimiter: "|",
			stateEndDelimiter: "|",
			macroStartToken: "^",
			variableStartToken: "{",
			variableEndToken: "}",
			isDefault: true,
		},
	) {}

	/**
	 * Parses a clinical dictation stream and extracts mapped schemas.
	 */
	async parse(text: string): Promise<ParsedItem[]> {
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
					const parsed = await this.parseSegment(tag, content);
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
	): Promise<ParsedItem | null> {
		// Strip the tag token (e.g. '#' or '$') to find the tag key
		const tagToken = this.profile.tagToken;
		let cleanKey = tag.startsWith(tagToken)
			? tag.substring(tagToken.length).toLowerCase()
			: tag.toLowerCase();

		// Apply profile-configured tag mappings for internationalization/localization/poweruser support
		if (this.profile.tagMappings && this.profile.tagMappings[cleanKey]) {
			cleanKey = this.profile.tagMappings[cleanKey]!.toLowerCase();
		}

		// Apply profile-configured attribute rules
		const rules = this.profile.attributeRules || DEFAULT_ATTRIBUTE_RULES;
		const attributes: Record<string, string> = {};
		let contentCleaned = content;

		for (const rule of rules) {
			for (const pattern of rule.regexPatterns) {
				const flags = rule.isCaseInsensitive !== false ? "i" : "";
				const regex = new RegExp(pattern, flags);
				if (regex.test(content)) {
					attributes[rule.targetField] = rule.targetValue;
				}
			}
		}

		for (const rule of rules) {
			for (const pattern of rule.regexPatterns) {
				const flags = rule.isCaseInsensitive !== false ? "i" : "";
				const regex = new RegExp(pattern, flags);
				contentCleaned = contentCleaned.replace(regex, " ");
			}
		}
		contentCleaned = contentCleaned.replace(/\s+/g, " ").trim();

		const wordsCleaned = contentCleaned.split(/\s+/).filter(Boolean);
		if (wordsCleaned.length === 0) return null;

		if (
			cleanKey === CANONICAL_TAGS.VITALS.toLowerCase() ||
			cleanKey === "vital"
		) {
			// e.g. temp 38.5 Cel, pulse 80, BP 120/80
			const anchorText = wordsCleaned[0] || "";
			const valueText = wordsCleaned[1] || "";
			const unitText = wordsCleaned[2] || "";

			// Resolve concepts
			const resolved = await this.resolveConcept(anchorText, "LOINC");
			const display = resolved?.display || anchorText;
			const conceptId = resolved?.id;

			// Default properties based on anchor
			let defaultUnit = "";
			const targetSchema = "VitalsMeasurementEvent";

			if (/temp/i.test(anchorText)) {
				defaultUnit = "Cel";
			} else if (/pulse|hr|heart/i.test(anchorText)) {
				defaultUnit = "/min";
			} else if (/bp|blood/i.test(anchorText)) {
				defaultUnit = "mm[Hg]";
			} else if (/spo2|sat/i.test(anchorText)) {
				defaultUnit = "%";
			} else if (/rr|resp/i.test(anchorText)) {
				defaultUnit = "/min";
			}

			return {
				tag,
				anchorText,
				conceptId,
				display,
				value: Number.isNaN(Number(valueText)) ? valueText : Number(valueText),
				unit: unitText || defaultUnit,
				targetSchema,
				rawText: `${tag} ${content}`,
			};
		}

		if (
			cleanKey === CANONICAL_TAGS.OBSERVATION.toLowerCase() ||
			cleanKey === "observation" ||
			cleanKey === "symptom"
		) {
			// e.g. severe chest pain, denies cough
			const certainty = attributes.certainty || "confirmed";
			const status = attributes.status || "active";
			const severity = attributes.severity || "moderate";
			const anchorText = wordsCleaned.join(" ");

			const resolved = await this.resolveConcept(anchorText, "SNOMED");
			const display = resolved?.display || anchorText;
			const conceptId = resolved?.id;

			return {
				tag,
				anchorText,
				conceptId,
				display,
				severity,
				certainty,
				status,
				targetSchema: "ObservationEvent",
				rawText: `${tag} ${content}`,
			};
		}

		if (
			cleanKey === CANONICAL_TAGS.MEDICATION.toLowerCase() ||
			cleanKey === "rx" ||
			cleanKey === "med"
		) {
			// e.g. Amoxicillin oral TID 10 days
			const anchorText = wordsCleaned[0] || "";
			const route = attributes.route || "ORAL";
			const frequency = attributes.frequency || "TID";
			let duration = "10 days";

			const durationMatch = contentCleaned.toLowerCase().match(/(\d+\s*days?)/);
			if (durationMatch) {
				duration = durationMatch[0];
			}

			const resolved = await this.resolveConcept(anchorText, "RxNorm");
			const display = resolved?.display || anchorText;
			const conceptId = resolved?.id;

			return {
				tag,
				anchorText,
				conceptId,
				display,
				route,
				frequency,
				duration,
				status: "ACTIVE",
				targetSchema: "MedicationOrderObject",
				rawText: `${tag} ${content}`,
			};
		}

		return null;
	}

	private async resolveConcept(
		text: string,
		namespace: string,
	): Promise<{ id: string; display: string } | null> {
		try {
			const results = await this.dictionaryStore.search(text, namespace, 5);
			if (results && results.length > 0 && results[0]) {
				return { id: results[0].id, display: results[0].display };
			}
		} catch (_) {}
		return null;
	}
}
