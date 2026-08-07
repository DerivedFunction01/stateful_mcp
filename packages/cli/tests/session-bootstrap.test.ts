import { describe, expect, test } from "bun:test";
import { bootstrapSession } from "../src/lib/session/bootstrap-session";
import { Cli2BootstrapBuilder } from "../src/lib/session/cli2-bootstrap";

describe("bootstrapSession", () => {
	test("constructs the V2 clinical runtime and notebook session", async () => {
		const result = await bootstrapSession({
			sessionId: `cli2-bootstrap-test-${Date.now()}`,
		});
		expect(result.engine).toBeDefined();
		expect(result.notebook).toBeDefined();
		expect(result.commandBar).toBeDefined();
		expect(result.sessionId).toBeTruthy();
		expect(result.notebookSessionStore).toBeDefined();
		expect(result.caseIdentity.patient.id).toContain("mock-patient-cli2-");
		expect(result.caseIdentity.documentId).toBeTruthy();
		expect(result.caseIdentity.workspaceId).toBeTruthy();
		const session = await result.notebookSessionStore.get(result.sessionId);
		expect(session?.documentId).toBe(result.caseIdentity.documentId);
		expect(session?.workspaceId).toBe(result.caseIdentity.workspaceId);
		expect(session?.uiState?.soap?.sections.assessment?.cells).toHaveLength(1);
		expect(Object.keys(session?.uiState?.soap?.sections ?? {})).toEqual([
			"subjective",
			"objective",
			"assessment",
			"plan",
		]);
	});

	test("persists notebook-local scratchpad state separately from bootstrap defaults", async () => {
		const result = await bootstrapSession({
			sessionId: `cli2-scratchpad-state-${Date.now()}`,
		});
		const session = await result.notebookSessionStore.get(result.sessionId);
		if (!session?.uiState?.soap?.sections.assessment)
			throw new Error("Assessment scratchpad state was not bootstrapped");
		const assessment = session.uiState.soap.sections.assessment;
		const nextUiState = {
			...session.uiState,
			soap: {
				...session.uiState.soap,
				sections: {
					...session.uiState.soap.sections,
					assessment: {
						...assessment,
						cells: [
							{
								...assessment.cells[0]!,
								text: "clinical text",
								pinnedMacroIds: ["active-v2"],
								explicitPins: true,
							},
						],
					},
				},
			},
		};
		await result.notebook.saveUiState({
			uiState: nextUiState,
			expectedRevision: session.revision,
		});
		const restored = await result.notebookSessionStore.get(result.sessionId);
		expect(
			restored?.uiState?.soap?.sections.assessment?.cells[0],
		).toMatchObject({
			text: "clinical text",
			pinnedMacroIds: ["active-v2"],
			explicitPins: true,
		});
	});

	test("serializes consecutive notebook UI saves without revision collisions", async () => {
		const result = await bootstrapSession({
			sessionId: `cli2-ui-save-queue-${Date.now()}`,
		});
		const session = await result.notebookSessionStore.get(result.sessionId);
		if (!session?.uiState)
			throw new Error("Notebook UI state was not bootstrapped");
		const first = {
			...session.uiState,
			console: { focused: true },
		};
		const second = {
			...session.uiState,
			console: { focused: false },
		};
		await Promise.all([
			result.notebook.saveUiState({
				uiState: first,
				expectedRevision: session.revision,
			}),
			result.notebook.saveUiState({
				uiState: second,
				expectedRevision: session.revision,
			}),
		]);
		const saved = await result.notebookSessionStore.get(result.sessionId);
		expect(saved?.uiState?.console?.focused).toBe(false);
		expect(saved?.revision).toBe(session.revision + 2);
	});

	test("resumes an explicitly selected session via sessionId option", async () => {
		const dbPath = `/tmp/kilo/cli2-multi-${Date.now()}.sqlite`;
		const first = await Cli2BootstrapBuilder.withDefaultBackend("sqlite", {
			dbPath,
			sessionId: "cli2-multi-a",
		});
		expect(first.bootstrapStatus).toBe("created");
		const second = await Cli2BootstrapBuilder.withDefaultBackend("sqlite", {
			dbPath,
			sessionId: "cli2-multi-b",
		});
		expect(second.bootstrapStatus).toBe("created");
		expect(second.sessionId).toBe("cli2-multi-b");
		expect(second.caseIdentity.documentId).not.toBe(
			first.caseIdentity.documentId,
		);

		// Resume each independently
		const resumedA = await Cli2BootstrapBuilder.withDefaultBackend("sqlite", {
			dbPath,
			sessionId: "cli2-multi-a",
		});
		expect(resumedA.bootstrapStatus).toBe("resumed");
		expect(resumedA.sessionId).toBe("cli2-multi-a");
		expect(resumedA.caseIdentity.documentId).toBe(
			first.caseIdentity.documentId,
		);
		const resumedB = await Cli2BootstrapBuilder.withDefaultBackend("sqlite", {
			dbPath,
			sessionId: "cli2-multi-b",
		});
		expect(resumedB.bootstrapStatus).toBe("resumed");
		expect(resumedB.sessionId).toBe("cli2-multi-b");
		expect(resumedB.caseIdentity.documentId).toBe(
			second.caseIdentity.documentId,
		);
	});
});
