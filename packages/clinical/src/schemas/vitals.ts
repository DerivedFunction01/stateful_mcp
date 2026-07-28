import type {
	CountMeasurement,
	PressureMeasurement,
	TemperatureMeasurement,
} from "./measurement";
import type {
	AnatomicalLocation,
	ClinicalSourceType,
	CodeableConcept,
	OrganSystem,
} from "./shared";
import type { ClinicalDateRange } from "./time";

// =====================================================================
// VITAL SIGNS
// =====================================================================

export interface VitalsMeasurementEvent {
	id: string;
	vitalType: CodeableConcept;
	rawTerm: string;
	measurement: TemperatureMeasurement | PressureMeasurement | CountMeasurement;
	anatomyLocations?: AnatomicalLocation[];
	sourceType?: ClinicalSourceType;
	dateRange?: ClinicalDateRange;
}

/**
 * First-class blood pressure vital — guarantees both systolic and diastolic
 * are present rather than optionally nested on the base type.
 */
export interface BloodPressureVitalEvent
	extends Omit<VitalsMeasurementEvent, "measurement"> {
	vitalType: CodeableConcept; // Should reference LOINC::55284-4 or equivalent
	systolic: PressureMeasurement;
	diastolic: PressureMeasurement;
	meanArterialPressure?: PressureMeasurement;
}

// =====================================================================
// PHYSICAL EXAMINATION
// =====================================================================

/**
 * A single finding within an organ system examination.
 * Multiple findings per system are expected (e.g. cardiovascular: S1/S2 present,
 * no murmur, regular rate and rhythm).
 */
export interface PhysicalExamFinding {
	finding: CodeableConcept;
	status: "normal" | "abnormal" | "not_examined";
	clinicalDescription?: string;
}

export interface PhysicalExamObject {
	id: string;
	organSystem: OrganSystem;
	findings: PhysicalExamFinding[];
	rawTerm?: string;
	/**
	 * Overall system impression when the per-finding granularity is insufficient.
	 */
	systemImpression?: "normal" | "abnormal" | "not_examined";
	notes?: string;
}
