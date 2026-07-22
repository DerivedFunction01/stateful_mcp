import type {
	AlgorithmicEvaluationObject,
	AssessmentObject,
	DeviceDiagnosticObject,
} from "./assessment";
import type { EnvironmentContextObject } from "./environment";
import type { ExposureEvent } from "./exposure";
import type {
	MechanicalInjuryObject,
	ProtectiveEquipmentObject,
} from "./injury";
import type { MedicationOrderObject, ProcedureOrderObject } from "./medication";
import type { ObservationEvent } from "./observation";
import type { PatientProfile } from "./patient";
import type { ClinicalDateRange } from "./shared";
import type { PhysicalExamObject, VitalsMeasurementEvent } from "./vitals";

export interface SoapNote {
	id: string;
	title: string;
	createdAt: string;
	updatedAt: string;
	status: "draft" | "signed";
	signedBy?: string;
	patient: PatientProfile;
	subjective: {
		observations: ObservationEvent[];
		exposures: ExposureEvent[];
		injuries: MechanicalInjuryObject[];
		environments?: EnvironmentContextObject[];
		protectiveEquipment?: ProtectiveEquipmentObject[];
		narrative?: string;
	};
	objective: {
		vitals: VitalsMeasurementEvent[];
		exams: PhysicalExamObject[];
		devices?: DeviceDiagnosticObject[];
		observations: ObservationEvent[];
		environments?: EnvironmentContextObject[];
		narrative?: string;
	};
	assessment: {
		diagnoses: AssessmentObject[];
		observations: ObservationEvent[];
		algorithmicEvaluations?: AlgorithmicEvaluationObject[];
		narrative?: string;
	};
	plan: {
		medications: MedicationOrderObject[];
		procedures: ProcedureOrderObject[];
		followUp?: {
			followUpWindow: ClinicalDateRange;
			instructions?: string;
		};
		narrative?: string;
	};
	cells: Array<Record<string, unknown>>;
}
