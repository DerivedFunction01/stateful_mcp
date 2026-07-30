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
import { ClinicalEngine } from "../src/engine/clinical-engine";
import type { SoapNote } from "../src/schemas/document";
import type { SignedSoapNoteRecord } from "../src/store/interfaces";

describe("ClinicalEngine EventStore-to-ObjectStore Reconciliation & Merging", () => {
	it("should dynamically reconcile event log to stateful ObjectStore, and support git-like branching/merging", async () => {
		// 1. Set up core stores
		const coreAdapter = await createRepo({
			object: { session: { type: "memory" }, persistent: { type: "memory" } },
			event: { session: { type: "memory" }, persistent: { type: "memory" } },
		});
		const dictionaryStore = new DictionaryStore(
			new InMemoryConceptResolver(),
			createMemoryConceptStore(),
			createMemoryExpressionStore(),
		);

		// Seed patient concept
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

		const mockSignedStore: any = {
			archive: async (record: SignedSoapNoteRecord) => record,
		};

		const objectSchemas = new Map<string, any>();
		const objectStore = new ObjectStore(
			coreAdapter.sessionObject!,
			coreAdapter.persistentObject!,
			objectSchemas,
		);

		const eventSchemas = new Map<string, any>();
		const eventStore = new EventStore({
			session: coreAdapter.sessionEvent!,
			persistent: coreAdapter.persistentEvent!,
			schemas: eventSchemas,
		});

		const clinicalEngine = new ClinicalEngine({
			objectStore,
			eventStore,
			dictionaryStore,
			signedNoteStore: mockSignedStore,
		});

		const sessionId = "reconciliation_session_1";

		// 2. Initialize SOAP Note encounter
		await clinicalEngine.initEncounter(sessionId, {
			id: "pat-123",
			mrn: "MRN-123",
			name: { primaryOrSurname: "Smith", givenNames: ["John"] },
			administrativeGender: "male",
			lifecycle: "active",
			originationDate: {
				assertedTimestampUtc: "1985-05-15T00:00:00Z",
				precisionLevel: "day",
			},
			isOriginationEstimated: false,
			biologicalProfile: {
				id: "bio-123",
				organismType: "human",
			} as any,
		});

		// 3. Append events to active_note branch
		// Vital sign event
		const commit1 = await eventStore.append(
			sessionId,
			sessionId,
			{
				targetSchema: "vitalsmeasurementevent",
				vitalType: { display: "Systolic BP" },
				measurement: { magnitude: 120, unit: { display: "mmHg" } },
			},
			sessionId,
		);

		// Reconcile and check that ObjectStore has systolic BP
		await clinicalEngine.reconcileEventStateToObjectStore(commit1, sessionId);
		const noteObj1 = await objectStore.getObject(sessionId, sessionId);
		expect(noteObj1).toBeDefined();
		const note1 = noteObj1!.data as SoapNote;
		expect(note1.objective.vitalSigns).toHaveLength(1);
		expect(note1.objective.vitalSigns[0].measurement.magnitude).toBe(120);

		// 4. Branch off to do separate clinical assessment (Branch: assessment_branch)
		// Point new branch to current tip
		await eventStore.setAlias(sessionId, "assessment_branch", sessionId);

		// Add observation to the assessment branch
		await eventStore.append(
			sessionId,
			"assessment_branch",
			{
				targetSchema: "observationevent",
				observationType: { display: "Cough" },
				certainty: "confirmed",
			},
			"assessment_branch",
		);

		// 5. Meanwhile, main branch gets updated with another vital
		const commit3 = await eventStore.append(
			sessionId,
			sessionId,
			{
				targetSchema: "vitalsmeasurementevent",
				vitalType: { display: "Heart Rate" },
				measurement: { magnitude: 72, unit: { display: "bpm" } },
			},
			sessionId,
		);

		// Reconcile main branch tip to verify heart rate is present, but observation is NOT
		await clinicalEngine.reconcileEventStateToObjectStore(commit3, sessionId);
		const noteObjMain = await objectStore.getObject(sessionId, sessionId);
		expect(noteObjMain).toBeDefined();
		const noteMain = noteObjMain!.data as SoapNote;
		expect(noteMain.objective.vitalSigns).toHaveLength(2);
		expect(noteMain.subjective.historyOfPresentIllness.events).toHaveLength(0); // Cough is on branch

		// 6. Merge "assessment_branch" back to main branch
		const mergeResult = await eventStore.merge(
			sessionId,
			["assessment_branch"],
			sessionId,
		);
		const mergedTip =
			mergeResult.status === "clean"
				? mergeResult.commit_id!
				: await eventStore.mergeCommit(
						mergeResult.merge_session_id!,
						sessionId,
					);

		// 7. Reconcile final merged state back to SOAP ObjectStore
		await clinicalEngine.reconcileEventStateToObjectStore(mergedTip, sessionId);
		const noteObjFinal = await objectStore.getObject(sessionId, sessionId);
		expect(noteObjFinal).toBeDefined();
		const noteFinal = noteObjFinal!.data as SoapNote;

		// Both main branch updates (Heart Rate, Systolic BP) and assessment branch updates (Cough) must coexist!
		expect(noteFinal.objective.vitalSigns).toHaveLength(2);
		expect(noteFinal.objective.vitalSigns[0].measurement.magnitude).toBe(120);
		expect(noteFinal.objective.vitalSigns[1].measurement.magnitude).toBe(72);
		expect(noteFinal.objective.clinicalObservations).toHaveLength(1);
		expect((noteFinal.objective.clinicalObservations[0] as any).certainty).toBe(
			"confirmed",
		);
	});
});
