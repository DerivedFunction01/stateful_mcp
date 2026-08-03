import { describe, expect, it } from "bun:test";
import { V2CellCompiler } from "@stateful-mcp/clinical/v2/cells/v2-cell-compiler";
import { createV2SyntaxProfile } from "@stateful-mcp/clinical/v2/macros/macro-profile";
import { bootstrapV2Session } from "../src/lib/session/bootstrap-v2";

describe("cli2 V2 macro execution", () => {
	it("compiles a seeded macro, records a structured cell, and commits a clinical document", async () => {
		const runtime = await bootstrapV2Session({ sessionId: "macro-integration" });
		const document = await runtime.engine.initializeClinicalDocument({
			kind: "document_initialized",
			documentId: "doc-macro-integration",
			sessionId: runtime.sessionId,
			patientId: "patient-1",
		});
		const compiler = new V2CellCompiler(
			runtime.engine.getRuntime().macros.defs,
			runtime.engine.getRuntime().macros.schemaRegistry,
			runtime.engine.getRuntime().macros.dictionary,
			createV2SyntaxProfile({ ...runtime.syntaxProfile, profileId: runtime.syntaxProfile.profileId }),
		);
		const rawText = "^primary_diagnosis id=dx-1 diagnosis=SNOMED::233604007";
		const compiled = await compiler.compile(rawText, {
			sessionId: runtime.sessionId,
			documentId: document.documentId,
		});
		expect(compiled.diagnostics).toEqual([]);
		expect(compiled.plan?.operations).toHaveLength(2);

		const cell = await runtime.notebook.cellService.create({
			sessionId: runtime.sessionId,
			collection: { kind: "notebook", collectionId: runtime.sessionId },
			rawText,
		});
		expect(cell.authored.rawText).toBe(rawText);

		const plan = {
			...compiled.plan!,
			expectedVersions: [{ aggregateKind: "document" as const, aggregateId: document.documentId, expectedVersion: document.version, expectedHead: document.eventHead }],
		};
		const result = await runtime.engine.executePlan(plan);
		expect(result.status).toBe("committed");
		const projected = await runtime.engine.getDocument(document.documentId);
		const diagnosis = Object.values(projected?.records ?? {}).find((record) => record.schemaName === "PrimaryDiagnosis");
		expect(diagnosis?.values.id).toBe("dx-1");
	});
});
