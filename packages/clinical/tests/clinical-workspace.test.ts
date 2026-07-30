import { describe, expect, test } from "bun:test";
import { createRepo, EventStore, ObjectStore } from "@stateful-mcp/core";
import { ClinicalEngine } from "../src/engine/clinical-engine";
import type { EpistemicWorkspace } from "../src/schemas/epistemic";
import type { EpistemicWorkspaceStore } from "../src/store/interfaces";

class MockWorkspaceStore implements EpistemicWorkspaceStore {
	private store = new Map<string, EpistemicWorkspace>();
	async getWorkspace(id: string) {
		return this.store.get(id) || null;
	}
	async saveWorkspace(workspace: EpistemicWorkspace) {
		this.store.set(workspace.id, workspace);
	}
	async listWorkspacesForNote(noteId: string) {
		return Array.from(this.store.values()).filter(
			(w) => w.sourceSoapNoteId === noteId,
		);
	}
}

describe("Clinical Epistemic Workspace Lifecycle", () => {
	test("Initializes, updates, and completes workspace", async () => {
		const repo = await createRepo({
			object: { session: { type: "memory" }, persistent: { type: "memory" } },
			event: { session: { type: "memory" }, persistent: { type: "memory" } },
		});

		const objectStore = new ObjectStore(
			repo.sessionObject!,
			repo.persistentObject!,
			new Map<string, any>(),
		);

		const eventStore = new EventStore({
			session: repo.sessionEvent!,
			persistent: repo.persistentEvent!,
			schemas: new Map<string, any>(),
		});

		const workspaceStore = new MockWorkspaceStore();

		const engine = new ClinicalEngine({
			objectStore,
			eventStore,
			dictionaryStore: {} as any,
			signedNoteStore: {} as any,
			workspaceStore,
		});

		// 1. Create baseline active SoapNote
		const patient = {
			id: "pat_1",
			mrn: "MRN-1",
			name: { primaryOrSurname: "Doe" },
			administrativeGender: "male",
			status: "active",
			biologicalProfile: { organismType: "human" },
		} as any;

		const sessionId = "session_123";
		const noteId = await engine.initEncounter(sessionId, patient);

		// 2. Initialize assessment workspace
		const workspaceId = await engine.initAssessmentWorkspace(
			sessionId,
			noteId,
			[
				{ conceptId: "SNOMED::59282003", display: "Pulmonary Embolism" },
				{ conceptId: "SNOMED::312124007", display: "Bacterial Pneumonia" },
			],
		);

		expect(workspaceId).toBeDefined();

		const workspace = await workspaceStore.getWorkspace(workspaceId);
		expect(workspace).not.toBeNull();
		expect(workspace!.branches.length).toBe(2);
		expect(workspace!.activeBranchId).toBe(workspace!.branches[0]!.id);

		// 3. Complete workspace (promote PE branch)
		const finalNote = await engine.completeAssessmentWorkspace(
			sessionId,
			workspaceId,
			workspace!.branches[0]!.id,
		);

		expect(finalNote.assessment.primaryDiagnosis).toBeDefined();
		expect(
			(finalNote.assessment.primaryDiagnosis as any)?.concept?.[0]?.conceptId,
		).toBe("SNOMED::59282003");
		expect(finalNote.assessment.differentialDiagnoses.length).toBe(1);
		expect(
			(finalNote.assessment.differentialDiagnoses[0] as any)?.concept?.[0]
				?.conceptId,
		).toBe("SNOMED::312124007");
	});
});
