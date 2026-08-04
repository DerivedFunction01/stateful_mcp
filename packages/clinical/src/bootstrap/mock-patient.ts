import type { PatientProfile } from "../schemas/schemas-interface/patient";

export interface MockCaseIdentity {
	patient: PatientProfile;
	documentId: string;
	workspaceId: string;
}

/**
 * Creates the in-memory subject fixture used by the CLI2  bootstrap.
 *
 * There is intentionally no patient store in  yet. The profile is therefore
 * bootstrap context only; the clinical document stores its patient ID, while
 * the notebook session stores the document/workspace bindings.
 */
export function createMockCaseIdentity(sessionId: string): MockCaseIdentity {
	const key = stableKey(sessionId);
	const patientId = `mock-patient-cli2-${key}`;
	return {
		patient: {
			id: patientId,
			mrn: `MRN-CLI2-${key}`,
			name: {
				givenNames: ["CLI2"],
				primaryOrSurname: "Mock Patient",
			},
			administrativeGender: "undetermined",
			lifecycle: "active",
			originationDate: {
				assertedTimestampUtc: "2000-01-01T00:00:00.000Z",
				precisionLevel: "day",
			},
			isOriginationEstimated: true,
			biologicalProfile: {
				organismType: "human",
				id: patientId,
				identifierKey: `mock:${key}`,
			},
		},
		documentId: `document-cli2-${key}`,
		workspaceId: `workspace-cli2-${key}`,
	};
}

function stableKey(value: string): string {
	let hash = 2166136261;
	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0).toString(16);
}
