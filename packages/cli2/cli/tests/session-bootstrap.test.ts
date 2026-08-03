import { describe, expect, test, vi } from "bun:test";
import type { EngineBuilderResult } from "@stateful-mcp/clinical/engine/clinical-engine-builder";
import type { PatientProfile } from "@stateful-mcp/clinical/schemas/patient";
import type { NotebookStore } from "@stateful-mcp/clinical/store/notebook/notebook-store";
import {
	bootstrapSession,
	DEFAULT_TUI_PATIENT,
} from "../src/lib/session/bootstrap";

class FakeNotebookStore implements NotebookStore {
	async getSessionIds(): Promise<string[]> {
		return [];
	}
	async loadDocument(): Promise<null> {
		return null;
	}
	async saveDocument(): Promise<void> {}
	async listSession(): Promise<never[]> {
		return [];
	}
	async getCell(): Promise<null> {
		return null;
	}
	async insertCell(): Promise<void> {}
	async deleteCell(): Promise<void> {}
	async moveCell(): Promise<void> {}
}

function makeResult(
	ensureEncounter: (...a: any[]) => Promise<string>,
): EngineBuilderResult {
	return {
		engine: { ensureEncounter } as any,
		notebook: new FakeNotebookStore() as any,
	} as EngineBuilderResult;
}

describe("bootstrapSession", () => {
	test("calls ensureEncounter once with the default patient and returns a session id", async () => {
		const ensureEncounter = vi.fn(
			async (_sessionId: string, patient: PatientProfile) => {
				expect(patient.mrn).toBe("MRN-TUI");
				return "note_test";
			},
		);
		const result = makeResult(ensureEncounter);
		const out = await bootstrapSession({ result });
		expect(ensureEncounter).toHaveBeenCalledTimes(1);
		expect(out.sessionId).toMatch(/^tui-\d+$/);
		// ensureEncounter was called with the resolved session id
		expect(ensureEncounter).toHaveBeenCalledWith(
			out.sessionId,
			DEFAULT_TUI_PATIENT,
		);
	});

	test("uses a provided custom patient", async () => {
		const ensureEncounter = vi.fn(async () => "note_test");
		const customPatient = {
			id: "patient_custom",
			mrn: "MRN-CUSTOM",
			name: { primaryOrSurname: "Custom" },
			administrativeGender: "male" as const,
			lifecycle: "active" as const,
			biologicalProfile: { organismType: "human" as const },
		};
		const result = makeResult(ensureEncounter);
		await bootstrapSession({ result, patient: customPatient });
		expect(ensureEncounter).toHaveBeenCalledWith(
			expect.any(String),
			customPatient,
		);
	});

	test("does not build a new engine when a result is provided", async () => {
		const ensureEncounter = vi.fn(async () => "note_test");
		const result = makeResult(ensureEncounter);
		// withDefaultBackend would otherwise be invoked; an injected result short-circuits it.
		await bootstrapSession({ result });
		expect(ensureEncounter).toHaveBeenCalledTimes(1);
	});
});
