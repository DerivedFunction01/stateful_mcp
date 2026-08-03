import { describe, expect, it } from "bun:test";
import { registerClinicalSchemaAdapters } from "../src/v2/clinical/register-clinical-schema-adapters";
import { clinicalOperationsFromWorkspaceCompletion } from "../src/v2/clinical/workspace-clinical-linkage";
import {
	differentialDiagnosisSchema,
	primaryDiagnosisSchema,
} from "../src/v2/schemas/definitions/assessment-schema";
import { SchemaRegistry } from "../src/v2/schemas/schema-registry";
import type { V2WorkspaceAggregate } from "../src/v2/workspaces/workspace-types";

function workspace(
	overrides: Partial<V2WorkspaceAggregate> = {},
): V2WorkspaceAggregate {
	return {
		id: "ws-1",
		sessionId: "s1",
		sourceDocumentId: "doc-1",
		activeBranchId: "b1",
		globalFacts: [],
		closeRequested: false,
		version: 3,
		branches: [
			{
				id: "b1",
				parentId: null,
				name: "Primary",
				status: "confirmed",
				hypothesisConcept: { conceptId: "C1", display: "Pneumonia" },
				supportingConcepts: [],
				refutingConcepts: [],
				createdAt: "t",
			},
			{
				id: "b2",
				parentId: "b1",
				name: "Diff1",
				status: "active",
				hypothesisConcept: { conceptId: "C2", display: "Bronchitis" },
				supportingConcepts: [],
				refutingConcepts: [],
				createdAt: "t",
			},
			{
				id: "b3",
				parentId: "b1",
				name: "Diff2",
				status: "ruled_out",
				hypothesisConcept: { conceptId: "C3", display: "Asthma" },
				supportingConcepts: [],
				refutingConcepts: [],
				createdAt: "t",
			},
		],
		...overrides,
	};
}

describe("V2 workspace-completion clinical linkage", () => {
	it("emits PrimaryDiagnosis + DifferentialDiagnosis ops conforming to their schemas", () => {
		const ops = clinicalOperationsFromWorkspaceCompletion({
			documentId: "doc-1",
			workspace: workspace(),
		});

		const primary = ops.find((op) => op.schemaName === "PrimaryDiagnosis");
		const differentials = ops.filter(
			(op) => op.schemaName === "DifferentialDiagnosis",
		);

		expect(primary?.kind).toBe("record_upserted");
		const pv = (primary as { values: Record<string, unknown> }).values;
		expect(pv.id).toBe("b1");
		expect((pv.diagnosis as { conceptId: string }).conceptId).toBe("C1");

		expect(differentials).toHaveLength(2);
		const d = differentials.map(
			(op) => (op as { values: Record<string, unknown> }).values,
		);
		expect(d[0]!.rank).toBe(1);
		expect((d[0]!.diagnosis as { conceptId: string }).conceptId).toBe("C2");
		expect(d[0]!.status).toBe("active");
		expect(d[1]!.rank).toBe(2);
		expect(d[1]!.status).toBe("ruled_out");
	});

	it("produces records that pass per-schema adapter validation (upsert)", () => {
		const registry = new SchemaRegistry();
		registry.register(primaryDiagnosisSchema);
		registry.register(differentialDiagnosisSchema);
		const adapters = registerClinicalSchemaAdapters(registry);

		for (const op of clinicalOperationsFromWorkspaceCompletion({
			documentId: "doc-1",
			workspace: workspace(),
		})) {
			const adapter = adapters.get(op.schemaName, op.schemaVersion);
			const values = (op as { values: Record<string, unknown> }).values;
			expect(adapter.validateRecord(values, "upsert").valid).toBe(true);
		}
	});

	it("handles no confirmed/active branch (all become differentials)", () => {
		const ops = clinicalOperationsFromWorkspaceCompletion({
			documentId: "doc-1",
			workspace: workspace({
				activeBranchId: null,
				branches: workspace().branches.map((b) => ({ ...b, status: "active" })),
			}),
		});
		expect(ops.some((op) => op.schemaName === "PrimaryDiagnosis")).toBe(false);
		expect(ops.every((op) => op.schemaName === "DifferentialDiagnosis")).toBe(
			true,
		);
	});
});
