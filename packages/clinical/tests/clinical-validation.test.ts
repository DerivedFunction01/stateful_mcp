import { describe, expect, it } from "bun:test";
import {
	createMemoryConceptStore,
	createMemoryExpressionStore,
	DictionaryStore,
	EventStore,
	InMemoryConceptResolver,
	ObjectStore,
} from "@stateful-mcp/core";
import { createRepo } from "@stateful-mcp/core/src/adapters/storage/shared/unified-repo";
import type {
	EvaluatorRule,
	EvaluatorStore,
	EvaluatorTrigger,
	EventValidationResult,
} from "@stateful-mcp/core/src/middleware/event/evaluator-types";
import { ClinicalEngine } from "../src/engine/clinical-engine";
import type { SignedSoapNoteRecord } from "../src/store/interfaces";

describe("ClinicalEngine Safety Validation Integration", () => {
	class MockVitalsEvaluatorRule implements EvaluatorRule {
		ruleId = "encounter-vitals-safety-check";
		trigger: EvaluatorTrigger = {
			schemas: ["vitals"],
		};

		async evaluate(
			projectedState: any[],
			mutations: any[],
		): Promise<EventValidationResult> {
			// Reject if systolic BP > 300
			const invalid = projectedState.some(
				(r) => r.measurement?.magnitude > 300,
			);
			if (invalid) {
				return {
					valid: false,
					errors: ["Systolic blood pressure cannot exceed 300 mmHg"],
				};
			}
			return { valid: true, errors: [] };
		}
	}

	class MockClinicalEvaluatorStore implements EvaluatorStore {
		async getRules(schemaName: string): Promise<EvaluatorRule[]> {
			if (schemaName === "soap_note") {
				return [new MockVitalsEvaluatorRule()];
			}
			return [];
		}
	}

	it("should reject signing encounter note if any validation rule fails", async () => {
		// Set up core adapters
		const coreAdapter = await createRepo({
			object: { session: { type: "memory" }, persistent: { type: "memory" } },
			event: { session: { type: "memory" }, persistent: { type: "memory" } },
		});
		const dictionaryStore = new DictionaryStore(
			new InMemoryConceptResolver(),
			createMemoryConceptStore(),
			createMemoryExpressionStore(),
		);

		// Seed a patient concept/expression
		const conceptStore = (dictionaryStore as any)["conceptStore"];
		await conceptStore.addNamespace({
			code: "SNOMED",
			description: "SNOMED",
			isPublic: true,
			isExternalPrivate: false,
		});
		await conceptStore.addConcept({
			id: "SNOMED::116154003",
			standardCode: "116154003",
			display: "Patient Profile",
			namespaceCode: "SNOMED",
			active: true,
		});
		await dictionaryStore.addExpression({
			term: "Patient",
			regexPattern: "\\bpatient\\b",
			isCaseInsensitive: true,
			targetAssignment: "MAIN_TERM",
			conceptId: "SNOMED::116154003",
			priorityWeight: 1,
			active: true,
			id: "patient-exp",
		});

		// Mock SignedSoapNoteStore
		const mockSignedStore: any = {
			archive: async (record: SignedSoapNoteRecord) => record,
		};

		const schemasMap = new Map<string, any>();
		const objectStore = new ObjectStore(
			coreAdapter.sessionObject!,
			coreAdapter.persistentObject!,
			schemasMap,
		);

		const eventStore = new EventStore({
			session: coreAdapter.sessionEvent!,
			persistent: coreAdapter.persistentEvent!,
			schemas: schemasMap,
		});

		const evaluatorStore = new MockClinicalEvaluatorStore();
		const clinicalEngine = new ClinicalEngine({
			objectStore,
			eventStore,
			dictionaryStore,
			signedNoteStore: mockSignedStore,
			evaluatorStore,
		});

		const sessionId = "session_safety_check_1";
		await clinicalEngine.initEncounter(sessionId, {
			id: "pat-1",
			mrn: "MRN-1",
			name: { primaryOrSurname: "Doe", givenNames: ["Jane"] },
			administrativeGender: "female",
			lifecycle: "active",
			originationDate: {
				assertedTimestampUtc: "1990-01-01T00:00:00Z",
				precisionLevel: "day",
			},
			isOriginationEstimated: false,
			biologicalProfile: {
				id: "bio-1",
				organismType: "human",
			} as any,
		});

		// 1. Append vital sign with systolic BP = 320 mmHg
		const activeObj = await objectStore.getObject(sessionId, sessionId);
		expect(activeObj).toBeDefined();

		// Mutate the active note structure to add an invalid vital sign (systolic: 320)
		const updatedNote = { ...activeObj!.data };
		updatedNote.objective = {
			vitalSigns: [
				{
					id: "vit-1",
					vitalType: { display: "Systolic BP" },
					measurement: { magnitude: 320, unit: { display: "mmHg" } },
				},
			],
		};
		await objectStore.set(
			sessionId,
			["objective"],
			updatedNote.objective,
			sessionId,
		);

		// 2. Attempt to sign the encounter: should throw validation rejected error
		expect(
			clinicalEngine.signEncounter(sessionId, "Dr. House"),
		).rejects.toThrow("Systolic blood pressure cannot exceed 300 mmHg");

		// 3. Fix the systolic vital reading to 120 mmHg
		updatedNote.objective.vitalSigns[0].measurement.magnitude = 120;
		await objectStore.set(
			sessionId,
			["objective"],
			updatedNote.objective,
			sessionId,
		);

		// 4. Try signing again: should succeed
		const signedRecord = await clinicalEngine.signEncounter(
			sessionId,
			"Dr. House",
		);
		expect(signedRecord.signedBy).toBe("Dr. House");
	});
});
