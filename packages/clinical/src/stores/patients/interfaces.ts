import type { QueryDefinition } from "@stateful-mcp/core/middleware/filter/types";
import type { PatientProfile } from "../../schemas/schemas-interface/patient";

export interface PatientSearchResult {
	patientId: string;
	mrn: string;
	displayName: string;
	administrativeGender: PatientProfile["administrativeGender"];
	lifecycle: PatientProfile["lifecycle"];
	organismType: string;
}

export interface PatientStore {
	get(patientId: string): Promise<PatientProfile | null>;
	getByMrn(mrn: string): Promise<PatientProfile | null>;
	search(query: QueryDefinition): Promise<PatientSearchResult[]>;
	list(): Promise<PatientProfile[]>;
	set(patient: PatientProfile): Promise<void>;
	delete(patientId: string): Promise<void>;
}

export function patientProjection(patient: PatientProfile) {
	return {
		patientId: patient.id,
		mrn: patient.mrn,
		displayName: [
			...(patient.name.givenNames ?? []),
			patient.name.primaryOrSurname,
		]
			.filter(Boolean)
			.join(" "),
		givenNamesText: (patient.name.givenNames ?? []).join(" "),
		primaryOrSurname: patient.name.primaryOrSurname,
		administrativeGender: patient.administrativeGender,
		lifecycle: patient.lifecycle,
		organismType: patient.biologicalProfile.organismType,
		originationDateUtc: patient.originationDate.assertedTimestampUtc,
		profileBlob: patient,
	};
}

export function patientFromRow(row: Record<string, unknown>): PatientProfile {
	const profile = row.profileBlob;
	return typeof profile === "string"
		? JSON.parse(profile)
		: (profile as PatientProfile);
}
