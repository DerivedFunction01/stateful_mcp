import { describe, expect, test } from "bun:test";
import { bootstrapSession } from "../src/lib/session/bootstrap-session";

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
	});
});
