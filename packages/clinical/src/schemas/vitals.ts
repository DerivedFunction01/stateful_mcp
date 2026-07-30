import type {
	CountMeasurement,
	DistanceMeasurement,
	FractionMeasurement,
	MassMeasurement,
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


/**
 * Heart Rate (Pulse) — strictly enforces a CountMeasurement anchored by frequency units.
 */
export interface HeartRateVitalEvent extends Omit<VitalsMeasurementEvent, "measurement"> {
	vitalType: CodeableConcept; // e.g., LOINC::8867-4 (Heart rate)
	measurement: CountMeasurement & {
		unit?: Omit<CodeableConcept, "display"> & { display: "/min" | "beats_per_min" };
	};
}

/**
 * Respiratory Rate — strictly enforces a CountMeasurement anchored by breath units.
 */
export interface RespiratoryRateVitalEvent extends Omit<VitalsMeasurementEvent, "measurement"> {
	vitalType: CodeableConcept; // e.g., LOINC::9279-1 (Respiratory rate)
	measurement: CountMeasurement & {
		unit?: Omit<CodeableConcept, "display"> & { display: "/min" | "breaths_per_min" };
	};
}

/**
 * Oxygen Saturation (SpO2) — guarantees fractional/percentage bounds.
 */
export interface OxygenSaturationVitalEvent extends Omit<VitalsMeasurementEvent, "measurement"> {
	vitalType: CodeableConcept; // e.g., LOINC::2708-6 (Oxygen saturation in Arterial blood by Pulse oximetry)
	measurement: FractionMeasurement & {
		unit?: Omit<CodeableConcept, "display"> & { display: "%" | "percent" | "fraction" | "ratio" };
	};
}

/**
 * Body Temperature — strictly enforces thermal primitives.
 */
export interface TemperatureVitalEvent extends Omit<VitalsMeasurementEvent, "measurement"> {
	vitalType: CodeableConcept; // e.g., LOINC::8310-5 (Body temperature)
	measurement: TemperatureMeasurement;
}

/**
 * Body Weight — mapped to mass configurations.
 */
export interface WeightVitalEvent extends Omit<VitalsMeasurementEvent, "measurement"> {
	vitalType: CodeableConcept; // e.g., LOINC::29463-7 (Body weight)
	measurement: MassMeasurement;
}

/**
 * Body Height / Length — mapped to spatial distance configurations.
 */
export interface HeightVitalEvent extends Omit<VitalsMeasurementEvent, "measurement"> {
	vitalType: CodeableConcept; // e.g., LOINC::8302-2 (Body height)
	measurement: DistanceMeasurement;
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
