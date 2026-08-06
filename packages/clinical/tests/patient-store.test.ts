import { describe, expect, it } from "bun:test";
import { MemoryKvBackend } from "@stateful-mcp/core";
import type { PatientProfile } from "../src/schemas/schemas-interface/patient";
import { KvPatientStore } from "../src/stores/patients/kv-patient-store";
import { PatientQueryCompiler } from "../src/stores/sql/patient-query-compiler";

const patient: PatientProfile = {
	id: "patient-1",
	mrn: "MRN-1",
	name: { givenNames: ["Alex"], primaryOrSurname: "Example" },
	administrativeGender: "undetermined",
	lifecycle: "active",
	originationDate: {
		assertedTimestampUtc: "2000-01-01T00:00:00.000Z",
		precisionLevel: "day",
	},
	isOriginationEstimated: false,
	biologicalProfile: {
		organismType: "human",
		id: "patient-1",
		identifierKey: "patient:1",
	},
};

describe("patient store", () => {
	it("searches KV patient projections through QueryDefinition", async () => {
		const store = new KvPatientStore(new MemoryKvBackend());
		await store.set(patient);
		const result = await store.search({
			filters: [
				{ property: "displayName", operator: "str_contains", value: "Example" },
			],
		});
		expect(result).toHaveLength(1);
		expect(result[0]?.patientId).toBe("patient-1");
		expect((await store.get("patient-1"))?.mrn).toBe("MRN-1");
	});

	it("compiles portable patient persistence through the SQL AST", () => {
		for (const dialect of ["sqlite", "postgres", "duckdb"] as const) {
			const compiler = new PatientQueryCompiler(dialect);
			const ddl = compiler.getTableDDL("clinical_patients");
			const insert = compiler.compileUpsert(
				{ patientId: "patient-1", mrn: "MRN-1" },
				"clinical_patients",
			);
			expect(ddl[0]?.sql).toContain("clinical_patients");
			expect(insert.params).toContain("patient-1");
		}
	});
});
