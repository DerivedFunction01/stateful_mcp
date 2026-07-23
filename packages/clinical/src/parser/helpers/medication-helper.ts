import type {
	AttributeParserRule,
	ParserDictionaryRule,
} from "../../store/interfaces";
import { getCompiledRegex } from "../_compiled-regex";

export interface MedicationToken {
	anchorText: string;
	route?: string;
	duration?: string;
	quantity?: number;
	quantityUnit?: string;
}

export class MedicationTokenizer {
	static tokenize(
		content: string,
		attributeRules: AttributeParserRule[],
		evaluatorRules: ParserDictionaryRule[],
	): MedicationToken {
		let contentCleaned = content;
		const capturedProps: Record<string, any> = {};

		for (const rule of evaluatorRules) {
			for (const pattern of rule.regexPatterns) {
				const regex = getCompiledRegex(pattern, "i");
				const match = regex.exec(content);
				if (match && match.groups) {
					if (rule.targetField === "quantity") {
						const qtyStr = match.groups.quantity;
						const unitStr = match.groups.unit;
						if (qtyStr) {
							const quantity = Number.parseFloat(qtyStr);
							if (!Number.isNaN(quantity)) {
								capturedProps.quantity = quantity;
								if (unitStr) {
									capturedProps.quantityUnit =
										MedicationHelper.normalizeQuantityUnit(
											quantity,
											unitStr,
											attributeRules,
										);
								}
							}
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
			route: attributes.route,
			quantity: capturedProps.quantity,
			quantityUnit: capturedProps.quantityUnit,
		};
	}
}

export class MedicationHelper {
	static normalizeQuantityUnit(
		quantity: number,
		rawUnit: string,
		rules?: AttributeParserRule[],
	): string {
		let unitMapped = rawUnit.toLowerCase();

		if (rules && unitMapped) {
			for (const rule of rules) {
				if (
					rule.targetField === "unit" ||
					rule.targetField === "time_unit" ||
					rule.targetField === "measurement_unit"
				) {
					for (const pattern of rule.regexPatterns) {
						const flags = rule.isCaseInsensitive !== false ? "i" : "";
						const regex = getCompiledRegex(pattern, flags);
						if (regex.test(unitMapped)) {
							unitMapped = rule.targetValue;
							break;
						}
					}
				}
				if (unitMapped === rule.targetValue) break;
			}
		}

		return unitMapped;
	}
}
