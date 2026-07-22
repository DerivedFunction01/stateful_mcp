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

export class VitalsHelper {
	static findBloodPressure(
		groups: { systolic: string; diastolic: string; unit?: string },
		defaultUnit = "mmHg",
	): { systolic: number; diastolic: number; unit: string } {
		return {
			systolic: Number.parseInt(groups.systolic, 10),
			diastolic: Number.parseInt(groups.diastolic, 10),
			unit: groups.unit?.trim() || defaultUnit,
		};
	}

	static getVitalsSeverity(
		val: number,
		normalMin: number,
		normalMax: number,
	): string {
		if (val < normalMin) return "low";
		if (val > normalMax) return "high";
		return "normal";
	}
}
