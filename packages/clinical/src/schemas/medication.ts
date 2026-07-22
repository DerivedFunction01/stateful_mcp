import type { AttributeParserRule } from "../store/interfaces";
import type {
	ClinicalDateRange,
	CodeableConcept,
	Route,
	SingleMeasurement,
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
	dosage?: SingleMeasurement;
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

export class MedicationHelper {
	static parseQuantityUnit(
		groups: { quantity: string; unit: string },
		attributeRules?: AttributeParserRule[],
	): {
		value: number;
		unit: string;
	} {
		const val = Number.parseFloat(groups.quantity);
		let unitMapped = groups.unit.toLowerCase();

		if (attributeRules && unitMapped) {
			for (const rule of attributeRules) {
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

		return { value: val, unit: unitMapped };
	}
}
