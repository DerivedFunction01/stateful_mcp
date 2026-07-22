import type { AttributeParserRule } from "../store/interfaces";

export interface CodeableConcept {
	conceptId?: string;
	display: string;
}

export type ClinicalSourceType =
	| "patient_reported"
	| "clinician_observed"
	| "sensor_import"
	| "inspection"
	| "ehr_import"
	| "api_telemetry"
	| "telemetry_api"
	| "pacs_integration";

export type Status =
	| "present"
	| "absent"
	| "denied"
	| "resolved"
	| "newly_diganosed"
	| "not_applicable";

export type Certainty = "confirmed" | "suspected" | "refuted" | "differential";

export interface SingleMeasurement {
	magnitude: number;
	unit?: CodeableConcept;
	num_data_points?: number;
	operator?: "eq" | "gt" | "gte" | "lt" | "lte";
	is_approximate?: boolean;
}

export interface TimeMeasurement extends Omit<SingleMeasurement, "unit"> {
	/**
	 * Strictly limits measurement units to unchangeable chronological intervals.
	 * Reuses your shared TimePrecisionLevel type ("second" | "minute" | "hour", etc.)
	 */
	unit?: TimePrecisionLevel;
}

export type TimePrecisionLevel =
	| "second"
	| "minute"
	| "hour"
	| "morning_afternoon_evening"
	| "day"
	| "day_of_week"
	| "week"
	| "month"
	| "quarter"
	| "year"
	| "decade";

export interface TemporalBoundary {
	assertedTimestampUtc: string;
	precisionLevel: TimePrecisionLevel;
}

export interface TimeInterval {
	startDatetime?: TemporalBoundary;
	endDatetime?: TemporalBoundary;
	repeat?: {
		multiplier: number;
		level: TimePrecisionLevel;
	};
}

export interface ClinicalDateRange {
	time?: TimeInterval;
	includedDatetimes?: Array<{ time: TimeInterval; description?: string }>;
	excludedDatetimes?: Array<{ time: TimeInterval; description?: string }>;
	relativeEstimate?: {
		direction: "retrospective" | "prospective" | "static_approximate";
		firstValue: number;
		secondValue?: number;
		precisionUnit: TimePrecisionLevel;
		isDescriptive?: boolean;
	};
}

export interface BaseAgent {
	id?: string;
	organismType: "human" | "animal" | "plant";
	relationshipRole?: CodeableConcept;
	identifierKey?: string;
}

export interface HumanAgent extends BaseAgent {
	organismType: "human";
	socialRole:
		| "blood_relative"
		| "non_blood_relative"
		| "caregiver"
		| "friend"
		| "stranger"
		| "healthcare_provider";
}

export interface NonHumanAgent extends BaseAgent {
	organismType: "animal" | "plant";
	domesticationStatus:
		| "domesticated_managed"
		| "wild_unmanaged"
		| "feral"
		| "cultivated_agricultural";
	functionalUseSetting?:
		| "household_pet"
		| "working_service_animal"
		| "livestock_production"
		| "laboratory_research";
}

export type AssociatedAgent = HumanAgent | NonHumanAgent;

export interface ProductIdentifier {
	manufacturer?: CodeableConcept;
	modelOrProductName?: string;
	modelOrProductNumber?: string;
	buildYear?: number;
	registryTrackingNumber?: string;
}

export interface AnatomicalLocation {
	anatomy: CodeableConcept;
	laterality?:
		| "left"
		| "right"
		| "bilateral"
		| "midline"
		| "dorsal"
		| "ventral"
		| "axial"
		| "radial";
	depthIndex?: number;
}

export type Route =
	| "oral"
	| "intravenous"
	| "intramuscular"
	| "subcutaneous"
	| "topical"
	| "inhalation"
	| "sublingual"
	| "rectal"
	| "intranasal"
	| "transdermal"
	| "ophthalmic"
	| "otic"
	| "intrathecal";

export class MeasurementHelper {
	/**
	 * Parses a string representing a single measurement (e.g. ">38 Cel", "~37.5 C", "50")
	 */
	static parse(
		text: string,
		defaultUnit?: string,
		attributeRules?: AttributeParserRule[],
	): SingleMeasurement | null {
		const trimmed = text.trim();

		let opPatterns = [">=", "<=", ">", "<", "~"];
		if (attributeRules) {
			for (const rule of attributeRules) {
				if (
					rule.targetField === "operator" ||
					rule.targetField === "measurement_operator"
				) {
					opPatterns = [...opPatterns, ...rule.regexPatterns];
				}
			}
		}

		// Escape special regex chars and sort descending by length so longer patterns match first
		const sortedPatterns = opPatterns
			.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
			.sort((a, b) => b.length - a.length);

		const opRegexStr = `^(${sortedPatterns.join("|")})?\\s*(\\d+(?:\\.\\d+)?)\\s*(.*)$`;
		const opRegex = new RegExp(opRegexStr, "i");
		const match = opRegex.exec(trimmed);
		if (!match) return null;

		const opStr = match[1] || "";
		const magnitudeStr = match[2];
		if (!magnitudeStr) return null;
		const magnitude = Number.parseFloat(magnitudeStr);
		const remaining = match[3]?.trim() || "";

		let operator: SingleMeasurement["operator"] = "eq";
		let isApproximate = false;

		// 1. Resolve operator dynamically using profile rules if present
		let resolvedOp = false;
		if (attributeRules) {
			for (const rule of attributeRules) {
				if (
					rule.targetField === "operator" ||
					rule.targetField === "measurement_operator"
				) {
					for (const pattern of rule.regexPatterns) {
						const flags = rule.isCaseInsensitive !== false ? "i" : "";
						const regex = new RegExp(pattern, flags);
						if (regex.test(opStr)) {
							if (
								rule.targetValue === "is_approximate" ||
								rule.targetValue === "approximate"
							) {
								isApproximate = true;
							} else {
								operator = rule.targetValue as SingleMeasurement["operator"];
							}
							resolvedOp = true;
							break;
						}
					}
				}
				if (resolvedOp) break;
			}
		}

		// Fallback operator matching if not resolved by custom rules
		if (!resolvedOp && opStr) {
			if (opStr === ">") operator = "gt";
			else if (opStr === ">=") operator = "gte";
			else if (opStr === "<") operator = "lt";
			else if (opStr === "<=") operator = "lte";
			else if (opStr === "~") {
				isApproximate = true;
				operator = "eq";
			}
		}

		// 2. Resolve unit dynamically using profile rules if present
		let resolvedUnit = "";
		if (attributeRules && remaining) {
			for (const rule of attributeRules) {
				if (
					rule.targetField === "unit" ||
					rule.targetField === "measurement_unit"
				) {
					for (const pattern of rule.regexPatterns) {
						const flags = rule.isCaseInsensitive !== false ? "i" : "";
						const regex = new RegExp(pattern, flags);
						if (regex.test(remaining)) {
							resolvedUnit = rule.targetValue;
							break;
						}
					}
				}
				if (resolvedUnit) break;
			}
		}

		const unitDisplay = resolvedUnit || remaining || defaultUnit;
		const unit: CodeableConcept | undefined = unitDisplay
			? { display: unitDisplay }
			: undefined;

		return {
			magnitude,
			operator,
			is_approximate: isApproximate || undefined,
			unit,
		};
	}
}

export class TimeHelper {
	/**
	 * Parses a duration string (e.g. "2 hours", "3 days", "30 minutes")
	 */
	static parse(
		text: string,
		attributeRules?: AttributeParserRule[],
	): TimeMeasurement | null {
		const trimmed = text.trim();
		const match = /^(\d+(?:\.\d+)?)\s*(.*)$/.exec(trimmed);
		if (!match) return null;

		const magnitudeStr = match[1];
		if (!magnitudeStr) return null;
		const magnitude = Number.parseFloat(magnitudeStr);
		const rawUnit = match[2]?.trim().toLowerCase() || "";

		let unit: TimePrecisionLevel | undefined;

		// 1. Resolve time unit dynamically using profile rules if present
		if (attributeRules && rawUnit) {
			for (const rule of attributeRules) {
				if (rule.targetField === "time_unit" || rule.targetField === "unit") {
					for (const pattern of rule.regexPatterns) {
						const flags = rule.isCaseInsensitive !== false ? "i" : "";
						const regex = new RegExp(pattern, flags);
						if (regex.test(rawUnit)) {
							unit = rule.targetValue as TimePrecisionLevel;
							break;
						}
					}
				}
				if (unit) break;
			}
		}

		// Fallback language-centric time unit matching if not resolved by custom rules
		if (!unit && rawUnit) {
			if (rawUnit.startsWith("second") || rawUnit === "s") {
				unit = "second";
			} else if (
				rawUnit.startsWith("minute") ||
				rawUnit === "m" ||
				rawUnit === "min"
			) {
				unit = "minute";
			} else if (
				rawUnit.startsWith("hour") ||
				rawUnit === "h" ||
				rawUnit === "hr"
			) {
				unit = "hour";
			} else if (rawUnit.startsWith("day") || rawUnit === "d") {
				unit = "day";
			} else if (rawUnit.startsWith("week") || rawUnit === "w") {
				unit = "week";
			} else if (rawUnit.startsWith("month") || rawUnit === "mo") {
				unit = "month";
			} else if (
				rawUnit.startsWith("year") ||
				rawUnit === "y" ||
				rawUnit === "yr"
			) {
				unit = "year";
			}
		}

		return {
			magnitude,
			unit,
		};
	}
}
