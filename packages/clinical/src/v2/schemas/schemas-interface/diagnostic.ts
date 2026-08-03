import type { SingleMeasurement } from "./measurement";
import type {
	AnatomicalLocation,
	ClinicalSourceType,
	CodeableConcept,
	ProductIdentifier,
} from "./shared";
import type { ClinicalDateRange, TemporalBoundary } from "./time";

export const LAB_INTERPRETATION_FLAGS = [
	"normal",
	"high",
	"low",
	"critical_high",
	"critical_low",
	"abnormal",
	"indeterminate",
] as const;

export type LabInterpretationFlag = (typeof LAB_INTERPRETATION_FLAGS)[number];

/**
 * A single measured analyte within a lab panel.
 */
export interface LabAnalyte {
	name: CodeableConcept; // e.g. LOINC::2951-2 Serum Sodium
	measurements: SingleMeasurement[];
	interpretationFlag: LabInterpretationFlag;
	notes?: string;
}

/**
 * A complete lab panel or point-of-care result.
 * Examples: Basic Metabolic Panel, CBC, Rapid Strep, Urinalysis.
 */
export interface LabPanelResult {
	id: string;
	panelName: CodeableConcept; // e.g. LOINC::24320-4 Basic Metabolic Panel
	specimenType: CodeableConcept; // e.g. venous blood, urine, CSF
	collectionTime?: TemporalBoundary;
	resultTime?: TemporalBoundary;
	analytes: LabAnalyte[];
	sourceType: ClinicalSourceType;
	dateRange?: ClinicalDateRange;
	notes?: string;
}

// =====================================================================
// DEVICE / IMAGING DIAGNOSTIC RESULTS
// Migrated from assessment.ts — belongs in the Objective section.
// =====================================================================

export interface DeviceDiagnosticObject {
	id: string;
	modality: CodeableConcept; // Structured LOINC / DICOM tracking standard
	dicomReference?: string;
	interpretation?: string; // High-entropy textual summary overview
	findings: CodeableConcept[];
	anatomyLocations?: AnatomicalLocation[];
	productDetails?: ProductIdentifier; // Aligned with shared component specifications
	sourceType: ClinicalSourceType;
	dateRange?: ClinicalDateRange;
}
