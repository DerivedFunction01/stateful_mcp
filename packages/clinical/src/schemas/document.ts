import type {
	AlgorithmicEvaluationObject,
	DifferentialDiagnosisEntry,
	PrimaryDiagnosisEntry,
} from "./assessment";
import type { DeviceDiagnosticObject, LabPanelResult } from "./diagnostic";
import type { EnvironmentContextObject } from "./environment";
import type { ExposureEvent } from "./exposure";
import type { PatientHistories } from "./history";
import type {
	MechanicalInjuryObject,
	ProtectiveEquipmentObject,
} from "./injury";
import type { MedicationOrderObject } from "./medication";
import type { ObservationEvent } from "./observation";
import type { PatientProfile } from "./patient";
import type {
	InterventionOrderObject,
	InvestigationOrderObject,
	MilitaryPlanExtension,
	ReferralOrderObject,
	SafetyNettingPlan,
} from "./plan";
import type { OrganSystem } from "./shared";
import type { TemporalBoundary } from "./time";
import type { PhysicalExamObject, VitalsMeasurementEvent } from "./vitals";

export interface SoapNote {
	// ── Document Metadata ──────────────────────────────────────────────
	id: string;
	title: string;
	createdAt: TemporalBoundary;
	updatedAt: TemporalBoundary;
	status: "draft" | "signed" | "amended" | "voided";
	signedBy?: string;
	patient: PatientProfile;

	// ── SUBJECTIVE ─────────────────────────────────────────────────────
	subjective: {
		/**
		 * The primary reason the patient sought care today.
		 * A single structured observation representing the chief complaint.
		 */
		presentingComplaint: ObservationEvent;

		/**
		 * History of present illness — temporal sequence of symptom events
		 * leading up to this encounter, with optional narrative summary.
		 */
		historyOfPresentIllness: {
			events: ObservationEvent[];
			narrative?: string;
		};

		/**
		 * Review of systems — organ-system keyed map of patient-reported findings.
		 * Each key is an OrganSystem; each value is the observations for that system.
		 */
		reviewOfSystems?: Partial<Record<OrganSystem, ObservationEvent[]>>;

		/**
		 * Patient-reported histories: PMH, current medications, allergies,
		 * family history, social history, immunizations, surgical history.
		 */
		patientHistories: PatientHistories;

		/**
		 * Acute exposure events during or immediately prior to this encounter
		 * (chemical, pharmaceutical, biological). Not historical medication records —
		 * those live in patientHistories.currentMedications.
		 */
		exposures?: ExposureEvent[];

		injuries?: MechanicalInjuryObject[];
		environments?: EnvironmentContextObject[];
		protectiveEquipment?: ProtectiveEquipmentObject[];
	};

	// ── OBJECTIVE ──────────────────────────────────────────────────────
	objective: {
		/**
		 * Measured vital signs for this encounter.
		 * BloodPressureVitalEvent is a subset of VitalsMeasurementEvent with
		 * guaranteed systolic/diastolic fields.
		 */
		vitalSigns: VitalsMeasurementEvent[];

		/**
		 * Structured organ-system physical examination findings.
		 * Each PhysicalExamObject covers one organ system with a findings array.
		 */
		physicalExamination: PhysicalExamObject[];

		/**
		 * Cross-cutting clinician-observed findings that don't fit a structured
		 * organ system exam slot. Examples: "patient appears diaphoretic",
		 * "marked pallor", "in moderate distress", "alert and cooperative".
		 */
		clinicalObservations?: ObservationEvent[];

		/**
		 * Laboratory and point-of-care panel results (CBC, BMP, urinalysis, etc.).
		 */
		labResults?: LabPanelResult[];

		/**
		 * Device and imaging results (X-ray, MRI, ECG, ultrasound).
		 * DICOM references and structured findings per modality.
		 */
		imagingResults?: DeviceDiagnosticObject[];

		environments?: EnvironmentContextObject[];
		narrative?: string;
	};

	// ── ASSESSMENT ─────────────────────────────────────────────────────
	assessment: {
		/**
		 * The single working diagnosis for this encounter.
		 * Optional — may be absent in early-stage or undifferentiated presentations.
		 */
		primaryDiagnosis?: PrimaryDiagnosisEntry;

		/**
		 * Ranked differential diagnosis array, sorted ascending by rank
		 * (rank 1 = highest clinical suspicion).
		 */
		differentialDiagnoses: DifferentialDiagnosisEntry[];

		/**
		 * Observations that emerged during clinical reasoning — findings
		 * synthesized during the assessment process rather than directly observed
		 * or patient-reported.
		 */
		synthesisFindings?: ObservationEvent[];

		/**
		 * Algorithmic evaluations: drug interactions, risk scores,
		 * contraindication flags, diagnostic inference outputs.
		 */
		algorithmicEvaluations?: AlgorithmicEvaluationObject[];

		/**
		 * Free-text clinical impression tying together the assessment rationale.
		 */
		clinicalImpression?: string;
	};

	// ── PLAN ───────────────────────────────────────────────────────────
	plan: {
		/**
		 * New medication orders for this encounter (eRx / prescriptions).
		 * Not reported/historical medications — those live in
		 * subjective.patientHistories.currentMedications.
		 */
		prescriptions: MedicationOrderObject[];

		/**
		 * Outstanding laboratory and imaging investigations requested.
		 */
		investigations: InvestigationOrderObject[];

		/**
		 * Specialist referrals and care routing orders.
		 */
		referrals: ReferralOrderObject[];

		/**
		 * Scheduled procedures and surgical interventions.
		 */
		interventions: InterventionOrderObject[];

		/**
		 * Safety netting: patient red flags, return precautions,
		 * follow-up window, and escalation pathway.
		 */
		safetyNetting?: SafetyNettingPlan[];
		militaryPlan?: MilitaryPlanExtension;

		narrative?: string;
	};

	/**
	 * Jupyter-style computational cells.
	 * Placeholder for a future parser/runtime layer that maps raw clinician
	 * text to structured named-slot objects. Typing deferred pending
	 * runtime design decisions.
	 */
	cells: Array<Record<string, unknown>>;
}
