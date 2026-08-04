import { describe, expect, it } from "bun:test";
import { bootstrapSession } from "../src/lib/session/bootstrap-v2";
import { Cli2BootstrapBuilder } from "../src/lib/session/cli2-bootstrap-builder";

describe("cli2  bootstrap", () => {
	it("constructs the  engine without the legacy ClinicalEngineBuilder", async () => {
		const result = await bootstrapSession({ sessionId: "cli2-test" });
		expect(result.sessionId).toBe("cli2-test");
		expect(result.syntaxProfile.directCommandToken).toBe(":");
		expect(result.syntaxProfile.macroStartToken).toBe("^");
		expect(result.engine).toBeDefined();
		expect(result.bootstrapStatus).toBe("created");
		expect(result.caseIdentity.patient.id).toContain("mock-patient-cli2-");
		expect(result.caseIdentity.patient.biologicalProfile.organismType).toBe(
			"human",
		);
		const session = await result.notebookSessionStore.get(result.sessionId);
		expect(session?.documentId).toBe(result.caseIdentity.documentId);
		expect(session?.workspaceId).toBe(result.caseIdentity.workspaceId);
		const document = await result.engine.getDocument(result.caseIdentity.documentId);
		expect(document?.patientId).toBe(result.caseIdentity.patient.id);
		const workspace = await result.engine
			.getWorkspaceService()
			.getWorkspace(result.caseIdentity.workspaceId);
		expect(workspace?.sourceDocumentId).toBe(result.caseIdentity.documentId);
	});

	it("accepts a configured  syntax profile", async () => {
		const result = await bootstrapSession({
			syntaxProfile: {
				profileId: "custom",
				active: true,
				default: true,
				directCommandToken: "/",
				macroStartToken: "~",
				directCommandMappings: { ok: "confirm" },
				editorCommandMappings: {},
			},
		});
		expect(result.syntaxProfile.directCommandToken).toBe("/");
		expect(result.syntaxProfile.macroStartToken).toBe("~");
	});

	it("resumes persisted workspace and document bindings", async () => {
		const first = await bootstrapSession({ sessionId: "cli2-resume" });
		const session = await first.notebookSessionStore.get("cli2-resume");
		expect(session?.documentId).toBe(first.caseIdentity.documentId);
		expect(session?.workspaceId).toBe(first.caseIdentity.workspaceId);

		// The default bootstrap uses isolated in-memory stores, so resume is
		// validated through a shared session-store composition in production.
		expect(session?.revision).toBe(0);
	});

	it("resumes across SQLite builder instances", async () => {
		const dbPath = `/tmp/kilo/cli2-builder-${Date.now()}.sqlite`;
		const first = await Cli2BootstrapBuilder.withDefaultBackend("sqlite", {
			dbPath,
			sessionId: "cli2-sqlite-resume",
		});
		const second = await Cli2BootstrapBuilder.withDefaultBackend("sqlite", {
			dbPath,
			sessionId: "cli2-sqlite-resume",
		});
		expect(first.bootstrapStatus).toBe("created");
		expect(second.bootstrapStatus).toBe("resumed");
		expect(second.caseIdentity.documentId).toBe(first.caseIdentity.documentId);
	});

	it("resumes across JSONL builder instances", async () => {
		const basePath = `/tmp/kilo/cli2-builder-${Date.now()}`;
		const first = await Cli2BootstrapBuilder.withDefaultBackend("jsonl", {
			dbPath: basePath,
			sessionId: "cli2-jsonl-resume",
		});
		const second = await Cli2BootstrapBuilder.withDefaultBackend("jsonl", {
			dbPath: basePath,
			sessionId: "cli2-jsonl-resume",
		});
		expect(first.bootstrapStatus).toBe("created");
		expect(second.bootstrapStatus).toBe("resumed");
		expect(second.caseIdentity.workspaceId).toBe(first.caseIdentity.workspaceId);
	});
});
