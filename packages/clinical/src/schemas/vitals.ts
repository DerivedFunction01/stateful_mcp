import type {
	AnatomicalLocation,
	ClinicalSourceType,
	CodeableConcept,
} from "./shared";
import type {
	CountMeasurement,
	PressureMeasurement,
	TemperatureMeasurement,
} from "./measurement";
import type { ClinicalDateRange } from "./time";

export interface VitalsMeasurementEvent {
	id: string;
	soapSection: "objective";
	vitalType: CodeableConcept;
	rawTerm: string;
	measurement: TemperatureMeasurement | PressureMeasurement | CountMeasurement;
	bloodPressureDetails?: {
		systolic: PressureMeasurement;
		diastolic: PressureMeasurement;
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
