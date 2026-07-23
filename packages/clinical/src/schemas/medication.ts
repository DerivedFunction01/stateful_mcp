import type { AttributeParserRule, ParserDictionaryRule } from "../store/interfaces";
import type {
	ClinicalDateRange,
	CodeableConcept,
	DosageMeasurement,
	Route,
	TimePrecisionLevel,
} from "./shared";
export type CadenceBaseType =
	| "interval"
	| "event_anchored"
	| "continuous"
	| "one_time";

export type PhysiologicalEventAnchor =
	| "waking"
	| "before_meal"
	| "with_meal"
	| "after_meal"
	| "before_sleep";

export interface MedicationFrequency {
	cadenceType: CadenceBaseType;

	/**
	 * Bounded time intervals (e.g., every 8 hours, every 2 weeks).
	 * Populated exclusively when cadenceType === "interval".
	 * Reuses your shared TimePrecisionLevel definition.
	 */
	interval?: {
		multiplier: number;
		unit: TimePrecisionLevel;
	};

	/**
	 * Tied to biological/physiological circadian rhythms rather than wall-clock time.
	 * Populated exclusively when cadenceType === "event_anchored".
	 */
	eventAnchor?: PhysiologicalEventAnchor;

	/**
	 * As-needed authorization flag (pro re nata).
	 */
	isPrn: boolean;

	/**
	 * The clinical trigger condition justifying PRN administration.
	 * Reuses shared CodeableConcept (e.g., "Severe Pain", "Nausea").
	 */
	prnReason?: CodeableConcept;
}

export interface MedicationOrderObject {
	id: string;
	soapSection: "plan";
	medication: CodeableConcept;
	rawTerm?: string;
	dosage?: DosageMeasurement;
	frequency?: MedicationFrequency; // Formally transitioned to a parameterized struct
	route?: Route;
	quantityToDispense?: number;
	authorizedRefills: number;
	genericSubstitutionPermitted: boolean;
	targetIndication?: CodeableConcept;
	dateRange?: ClinicalDateRange;
}

export interface ProcedureOrderObject {
	id: string;
	soapSection: "plan";
	orderCategory: "laboratory" | "imaging" | "referral" | "intervention";
	procedure: CodeableConcept;
	rawTerm?: string;
	priority: "routine" | "urgent" | "stat";
	reason?: CodeableConcept;
}

export interface FollowUpPlanObject {
	id: string;
	soapSection: "plan";
	followUpWindow: ClinicalDateRange;
	instructions?: string;
}

export interface MedicationToken {
	anchorText: string;
	route?: string;
	frequency?: string;
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
				const regex = new RegExp(pattern, "i");
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
									capturedProps.quantityUnit = MedicationHelper.normalizeQuantityUnit(quantity, unitStr, attributeRules);
								}
							}
						}
					}
				}
			}
		}

		for (const rule of evaluatorRules) {
			for (const pattern of rule.regexPatterns) {
				const regex = new RegExp(pattern, "i");
				contentCleaned = contentCleaned.replace(regex, " ");
			}
		}

		const attributes: Record<string, string> = {};
		for (const rule of attributeRules) {
			for (const pattern of rule.regexPatterns) {
				const flags = rule.isCaseInsensitive !== false ? "i" : "";
				const regex = new RegExp(pattern, flags);
				if (regex.test(contentCleaned)) {
					attributes[rule.targetField] = rule.targetValue;
				}
			}
		}

		for (const rule of attributeRules) {
			for (const pattern of rule.regexPatterns) {
				const flags = rule.isCaseInsensitive !== false ? "i" : "";
				const regex = new RegExp(pattern, flags);
				contentCleaned = contentCleaned.replace(regex, " ");
			}
		}

		contentCleaned = contentCleaned.replace(/\s+/g, " ").trim();
		const wordsCleaned = contentCleaned.split(/\s+/).filter(Boolean);
		const anchorText = wordsCleaned[0] || "";

		return {
			anchorText,
			route: attributes.route,
			frequency: attributes.frequency,
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
						const regex = new RegExp(pattern, flags);
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
