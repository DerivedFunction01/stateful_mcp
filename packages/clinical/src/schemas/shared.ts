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

export interface MeasurementToken {
	operator?: string;
	magnitude: number;
	rawUnit?: string;
	isApproximate?: boolean;
}

export class MeasurementHelper {
	static tokenizeMeasurement(
		text: string,
		opPatterns: string[],
		unitRules?: AttributeParserRule[],
	): MeasurementToken | null {
		const trimmed = text.trim();
		const sortedPatterns = opPatterns
			.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
			.sort((a, b) => b.length - a.length);

		const opPart = sortedPatterns.length > 0 ? `(?:(?<operator>${sortedPatterns.join("|")}))?` : "";
		const regexStr = `^${opPart}\\s*(?<magnitude>\\d+(?:\\.\\d+)?)\\s*(?<remaining>.*)$`;
		const regex = new RegExp(regexStr, "i");
		const match = regex.exec(trimmed);
		if (!match) return null;

		const magnitudeStr = match.groups?.magnitude;
		if (!magnitudeStr) return null;
		const magnitude = Number.parseFloat(magnitudeStr);
		const remaining = match.groups?.remaining?.trim() || "";

		const rawOp = match.groups?.operator || "";
		let operator: string | undefined;
		let isApproximate = false;

		if (rawOp) {
			const rules = unitRules || DEFAULT_ATTRIBUTE_RULES;
			const opRules = rules.filter(r => r.targetField === "operator" || r.targetField === "measurement_operator");
			let resolved = false;
			for (const rule of opRules) {
				for (const pattern of rule.regexPatterns) {
					const flags = rule.isCaseInsensitive !== false ? "i" : "";
					const regex = new RegExp(pattern, flags);
					if (regex.test(rawOp)) {
						if (rule.targetValue === "is_approximate" || rule.targetValue === "approximate") {
							isApproximate = true;
						} else {
							operator = rule.targetValue;
						}
						resolved = true;
						break;
					}
				}
				if (resolved) break;
			}
		}

		return {
			magnitude,
			operator,
			isApproximate: isApproximate || undefined,
			rawUnit: remaining || undefined,
		};
	}

	static resolveUnit(
		unitDisplay: string,
		unitRules?: AttributeParserRule[],
	): string {
		const rules = unitRules && unitRules.length > 0 ? unitRules : DEFAULT_ATTRIBUTE_RULES;
		const matchingRules = rules.filter(r => r.targetField === "unit" || r.targetField === "measurement_unit");
		for (const rule of matchingRules) {
			for (const pattern of rule.regexPatterns) {
				const flags = rule.isCaseInsensitive !== false ? "i" : "";
				const regex = new RegExp(pattern, flags);
				if (regex.test(unitDisplay)) {
					return rule.targetValue;
				}
			}
		}
		return unitDisplay;
	}

	static parse(
		text: string,
		defaultUnit?: string,
		attributeRules?: AttributeParserRule[],
	): SingleMeasurement | null {
		const rules = attributeRules && attributeRules.length > 0 ? attributeRules : DEFAULT_ATTRIBUTE_RULES;
		const opRules = rules.filter(r => r.targetField === "operator" || r.targetField === "measurement_operator");
		const opPatterns = opRules.flatMap(r => r.regexPatterns);

		const token = MeasurementHelper.tokenizeMeasurement(text, opPatterns, rules);
		if (!token) return null;

		let resolvedUnit = "";
		if (token.rawUnit) {
			resolvedUnit = MeasurementHelper.resolveUnit(token.rawUnit, rules);
		}
		const unitDisplay = resolvedUnit || defaultUnit;
		const unit: CodeableConcept | undefined = unitDisplay
			? { display: unitDisplay }
			: undefined;

		let operator: SingleMeasurement["operator"] = "eq";
		if (token.operator === "gt" || token.operator === "gte" || token.operator === "lt" || token.operator === "lte" || token.operator === "eq") {
			operator = token.operator;
		}

		return {
			magnitude: token.magnitude,
			operator,
			is_approximate: token.isApproximate || undefined,
			unit,
		};
	}
}

export interface TimeToken {
	magnitude: number;
	rawUnit?: string;
}

export class TimeHelper {
	static tokenizeTime(text: string): TimeToken | null {
		const trimmed = text.trim();
		const match = /^(?<magnitude>\d+(?:\.\d+)?)\s*(?<rawUnit>.*)$/.exec(trimmed);
		if (!match) return null;

		const magnitudeStr = match.groups?.magnitude;
		if (!magnitudeStr) return null;
		const magnitude = Number.parseFloat(magnitudeStr);
		const rawUnit = match.groups?.rawUnit?.trim() || "";

		return {
			magnitude,
			rawUnit: rawUnit || undefined,
		};
	}

	static resolveTimeUnit(
		rawUnit: string,
		timeUnitRules?: AttributeParserRule[],
	): TimePrecisionLevel | undefined {
		const rules = timeUnitRules && timeUnitRules.length > 0 ? timeUnitRules : DEFAULT_ATTRIBUTE_RULES;
		const matchingRules = rules.filter(r => r.targetField === "time_unit" || r.targetField === "unit");
		for (const rule of matchingRules) {
			for (const pattern of rule.regexPatterns) {
				const flags = rule.isCaseInsensitive !== false ? "i" : "";
				const regex = new RegExp(pattern, flags);
				if (regex.test(rawUnit)) {
					return rule.targetValue as TimePrecisionLevel;
				}
			}
		}
		return undefined;
	}

	static parse(
		text: string,
		attributeRules?: AttributeParserRule[],
	): TimeMeasurement | null {
		const token = TimeHelper.tokenizeTime(text);
		if (!token) return null;

		let unit: TimePrecisionLevel | undefined;
		if (token.rawUnit) {
			unit = TimeHelper.resolveTimeUnit(token.rawUnit, attributeRules);
		}

		return {
			magnitude: token.magnitude,
			unit,
		};
	}
}
