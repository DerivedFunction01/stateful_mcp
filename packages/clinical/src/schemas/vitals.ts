import type { ParserDictionaryRule } from "../store/interfaces";
import type {
	AnatomicalLocation,
	ClinicalDateRange,
	ClinicalSourceType,
	CodeableConcept,
	SingleMeasurement,
} from "./shared";

export interface VitalsMeasurementEvent {
	id: string;
	soapSection: "objective";
	vitalType: CodeableConcept;
	rawTerm: string;
	measurement: SingleMeasurement;
	bloodPressureDetails?: {
		systolic: SingleMeasurement;
		diastolic: SingleMeasurement;
	};
	anatomyLocations?: AnatomicalLocation[];
	sourceType?: ClinicalSourceType;
	dateRange?: ClinicalDateRange;
}

export interface PhysicalExamObject {
	id: string;
	soapSection: "objective";
	organSystem:
		| "heent"
		| "cardiovascular"
		| "respiratory"
		| "gastrointestinal_abdominal"
		| "musculoskeletal"
		| "neurological"
		| "dermatological"
		| "psychiatric"
		| "genitourinary";
	finding: CodeableConcept;
	rawTerm: string;
	status: "normal" | "abnormal" | "not_examined";
	clinicalDescription?: string;
}

export interface VitalsToken {
	anchorText: string;
	systolic?: number;
	diastolic?: number;
	bloodPressureUnit?: string;
	value?: number;
	unit?: string;
}

export class VitalsTokenizer {
	static tokenize(
		content: string,
		evaluatorRules: ParserDictionaryRule[],
	): VitalsToken {
		const capturedProps: Record<string, any> = {};
		let contentCleaned = content;

		for (const rule of evaluatorRules) {
			for (const pattern of rule.regexPatterns) {
				const regex = new RegExp(pattern, "i");
				const match = regex.exec(content);
				if (match && match.groups) {
					if (rule.targetField === "blood_pressure") {
						const systolicStr = match.groups.systolic;
						const diastolicStr = match.groups.diastolic;
						if (systolicStr && diastolicStr) {
							const systolicVal = Number.parseInt(systolicStr, 10);
							const diastolicVal = Number.parseInt(diastolicStr, 10);
							const unitVal = match.groups.unit?.trim();
							if (!Number.isNaN(systolicVal) && !Number.isNaN(diastolicVal)) {
								capturedProps.systolic = systolicVal;
								capturedProps.diastolic = diastolicVal;
								if (unitVal) capturedProps.bloodPressureUnit = unitVal;
							}
						}
					} else if (rule.targetField === "quantity") {
						const quantityStr = match.groups.quantity;
						if (quantityStr) {
							const quantityVal = Number.parseFloat(quantityStr);
							const unitVal = match.groups.unit;
							if (!Number.isNaN(quantityVal)) {
								capturedProps.value = quantityVal;
								if (unitVal) capturedProps.unit = unitVal;
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
		contentCleaned = contentCleaned.replace(/\s+/g, " ").trim();

		const wordsCleaned = contentCleaned.split(/\s+/).filter(Boolean);
		const anchorText = wordsCleaned[0] || "";

		let value = capturedProps.value;
		let unit = capturedProps.unit;

		if (value === undefined && wordsCleaned.length >= 2) {
			const rawVal = wordsCleaned[1];
			if (rawVal) {
				const val = Number.parseFloat(rawVal);
				if (!Number.isNaN(val)) {
					value = val;
					unit = wordsCleaned[2];
				}
			}
		}

		return {
			anchorText,
			...capturedProps,
			value,
			unit,
		};
	}
}

export class VitalsHelper {
	static buildBloodPressure(
		systolic: number,
		diastolic: number,
		unit = "mmHg",
	): { systolic: number; diastolic: number; unit: string } {
		return {
			systolic,
			diastolic,
			unit,
		};
	}

	static classifyVitalsSeverity(
		val: number,
		normalMin: number,
		normalMax: number,
	): string {
		if (val < normalMin) return "low";
		if (val > normalMax) return "high";
		return "normal";
	}
}
