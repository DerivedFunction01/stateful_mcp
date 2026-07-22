import type { AttributeParserRule } from "../store/interfaces";
import { DEFAULT_ATTRIBUTE_RULES } from "../store/defaults";

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
		const rules = attributeRules && attributeRules.length > 0 ? attributeRules : DEFAULT_ATTRIBUTE_RULES;

		// 1. Gather operator rules and construct operator regex using named capture groups
		const opRules = rules.filter(r => r.targetField === "operator" || r.targetField === "measurement_operator");
		const opGroupPatterns: string[] = [];
		for (const rule of opRules) {
			const enumValue = rule.targetValue;
			if (enumValue) {
				const joinedPatterns = rule.regexPatterns.map(p => `(?:${p})`).join("|");
				opGroupPatterns.push(`(?<${enumValue}>${joinedPatterns})`);
			}
		}

		const opPart = opGroupPatterns.length > 0 ? `(?:${opGroupPatterns.join("|")})?` : "";
		const regexStr = `^${opPart}\\s*(?<magnitude>\\d+(?:\\.\\d+)?)\\s*(?<remaining>.*)$`;
		const regex = new RegExp(regexStr, "i");
		const match = regex.exec(trimmed);
		if (!match) return null;

		const magnitudeStr = match.groups?.magnitude;
		if (!magnitudeStr) return null;
		const magnitude = Number.parseFloat(magnitudeStr);
		const remaining = match.groups?.remaining?.trim() || "";

		let operator: SingleMeasurement["operator"] = "eq";
		let isApproximate = false;

		// Resolve operator and approximate status from matched named groups
		if (match.groups) {
			for (const rule of opRules) {
				const enumValue = rule.targetValue;
				if (enumValue && match.groups[enumValue] !== undefined) {
					if (enumValue === "is_approximate" || enumValue === "approximate") {
						isApproximate = true;
					} else {
						operator = enumValue as SingleMeasurement["operator"];
					}
					break;
				}
			}
		}

		// 2. Gather unit rules and match the remaining string
		let resolvedUnit = "";
		const unitRules = rules.filter(r => r.targetField === "unit" || r.targetField === "measurement_unit");
		if (remaining) {
			const unitGroupPatterns: string[] = [];
			for (const rule of unitRules) {
				const enumValue = rule.targetValue;
				if (enumValue) {
					const joinedPatterns = rule.regexPatterns.map(p => `(?:${p})`).join("|");
					unitGroupPatterns.push(`(?<${enumValue}>${joinedPatterns})`);
				}
			}
			if (unitGroupPatterns.length > 0) {
				const unitRegex = new RegExp(`^(?:${unitGroupPatterns.join("|")})$`, "i");
				const unitMatch = unitRegex.exec(remaining);
				if (unitMatch && unitMatch.groups) {
					for (const rule of unitRules) {
						const enumValue = rule.targetValue;
						if (enumValue && unitMatch.groups[enumValue] !== undefined) {
							resolvedUnit = enumValue;
							break;
						}
					}
				}
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
		const rules = attributeRules && attributeRules.length > 0 ? attributeRules : DEFAULT_ATTRIBUTE_RULES;

		// Gather time unit rules
		const timeRules = rules.filter(r => r.targetField === "time_unit" || r.targetField === "unit");
		const groupPatterns: string[] = [];
		for (const rule of timeRules) {
			const enumValue = rule.targetValue;
			if (enumValue) {
				const joinedPatterns = rule.regexPatterns.map(p => `(?:${p})`).join("|");
				groupPatterns.push(`(?<${enumValue}>${joinedPatterns})`);
			}
		}

		if (groupPatterns.length === 0) {
			const fallbackMatch = /^(?<magnitude>\d+(?:\.\d+)?)$/.exec(trimmed);
			if (!fallbackMatch) return null;
			return {
				magnitude: Number.parseFloat(fallbackMatch.groups?.magnitude || "0")
			};
		}

		const unitRegexStr = `(?:${groupPatterns.join("|")})`;
		const fullRegexStr = `^(?<magnitude>\\d+(?:\\.\\d+)?)\\s*(?<unit>${unitRegexStr})?$`;
		const regex = new RegExp(fullRegexStr, "i");
		const match = regex.exec(trimmed);
		if (!match) return null;

		const magnitudeStr = match.groups?.magnitude;
		if (!magnitudeStr) return null;
		const magnitude = Number.parseFloat(magnitudeStr);

		let unit: TimePrecisionLevel | undefined;
		if (match.groups) {
			for (const rule of timeRules) {
				const enumValue = rule.targetValue;
				if (enumValue && match.groups[enumValue] !== undefined) {
					unit = enumValue as TimePrecisionLevel;
					break;
				}
			}
		}

		return {
			magnitude,
			unit,
		};
	}
}
