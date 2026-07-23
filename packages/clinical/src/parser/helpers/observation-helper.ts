import type {
	AttributeParserRule,
	ParserDictionaryRule,
} from "../../store/interfaces";
import { getCompiledRegex } from "../_compiled-regex";
import {
	NamedGroupContractError,
	validateNamedGroups,
} from "../utils/named-group-validator";

export interface ObservationToken {
	anchorText: string;
	certainty?: string;
	status?: string;
	severity?: string;
	severityScore?: { score: number; maxScore: number; normalizedScore: number };
}

export class ObservationTokenizer {
	static tokenize(
		content: string,
		attributeRules: AttributeParserRule[],
		evaluatorRules: ParserDictionaryRule[],
	): ObservationToken {
		let severityScore: ObservationToken["severityScore"] | undefined;
		let contentCleaned = content;

		for (const rule of evaluatorRules) {
			for (const pattern of rule.regexPatterns) {
				const regex = getCompiledRegex(pattern, "i");
				const match = regex.exec(content);
				if (match && match.groups) {
					try {
						validateNamedGroups(match.groups, rule.namedGroupContract);
					} catch (e) {
						if (e instanceof NamedGroupContractError) continue;
						throw e;
					}
					if (rule.targetField === "severityScore") {
						const numStr = match.groups.numerator;
						const denStr = match.groups.denominator;
						if (numStr) {
							const num = Number.parseFloat(numStr);
							const den = denStr ? Number.parseFloat(denStr) : 10;
							severityScore = ObservationHelper.computeScore(num, den);
						}
					}
				}
			}
		}

		for (const rule of evaluatorRules) {
			for (const pattern of rule.regexPatterns) {
				const regex = getCompiledRegex(pattern, "i");
				contentCleaned = contentCleaned.replace(regex, " ");
			}
		}

		const attributes: Record<string, string> = {};
		for (const rule of attributeRules) {
			for (const pattern of rule.regexPatterns) {
				const flags = rule.isCaseInsensitive !== false ? "i" : "";
				const regex = getCompiledRegex(pattern, flags);
				if (regex.test(contentCleaned)) {
					attributes[rule.targetField] = rule.targetValue;
				}
			}
		}

		for (const rule of attributeRules) {
			for (const pattern of rule.regexPatterns) {
				const flags = rule.isCaseInsensitive !== false ? "i" : "";
				const regex = getCompiledRegex(pattern, flags);
				contentCleaned = contentCleaned.replace(regex, " ");
			}
		}

		contentCleaned = contentCleaned.replace(/\s+/g, " ").trim();
		const wordsCleaned = contentCleaned.split(/\s+/).filter(Boolean);
		const anchorText = contentCleaned.trim();

		return {
			anchorText,
			certainty: attributes.certainty,
			status: attributes.status,
			severity: attributes.severity,
			severityScore,
		};
	}
}

export class ObservationHelper {
	static computeScore(
		numerator: number,
		denominator?: number,
		baseScale = 10,
	): { score: number; maxScore: number; normalizedScore: number } {
		const den = denominator !== undefined ? denominator : baseScale;
		const normalized = (numerator / den) * baseScale;
		return { score: numerator, maxScore: den, normalizedScore: normalized };
	}
}
