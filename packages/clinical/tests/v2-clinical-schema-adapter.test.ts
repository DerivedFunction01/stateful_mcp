import { describe, expect, it } from "bun:test";
import {
	buildClinicalSchemaAdapter,
	registerClinicalSchemaAdapters,
} from "../src/v2/clinical/register-clinical-schema-adapters";
import { primaryDiagnosisSchema } from "../src/v2/schemas/definitions/assessment-schema";
import { SchemaRegistry } from "../src/v2/schemas/schema-registry";

describe("V2 clinical per-schema adapters", () => {
	it("registers a real adapter for every published schema (no shared permissive adapter)", () => {
		const registry = new SchemaRegistry();
		registry.register(primaryDiagnosisSchema);
		const adapters = registerClinicalSchemaAdapters(registry);

		for (const schema of registry.list()) {
			expect(adapters.get(schema.schema, schema.version).schemaName).toBe(
				schema.schema,
			);
		}
	});

	it("derives identity field and required paths from the schema definition", () => {
		const registry = new SchemaRegistry();
		registry.register(primaryDiagnosisSchema);
		const adapters = registerClinicalSchemaAdapters(registry);
		const adapter = adapters.get("PrimaryDiagnosis", 1);

		expect(adapter.identityField).toBe("id");
		expect(adapter.mergePolicy).toBe("record");
	});

	it("requires all required fields on upsert", () => {
		const registry = new SchemaRegistry();
		registry.register(primaryDiagnosisSchema);
		const adapter = buildClinicalSchemaAdapter(
			registry.get("PrimaryDiagnosis", 1)!,
		);

		const missing = adapter.validateRecord({ id: "dx-1" }, "upsert");
		expect(missing.valid).toBe(false);
		expect(missing.diagnostics.some((d) => d.includes("diagnosis"))).toBe(true);

		const complete = adapter.validateRecord(
			{ id: "dx-1", diagnosis: { conceptId: "c1" } },
			"upsert",
		);
		expect(complete.valid).toBe(true);
	});

	it("does not require required fields on a patch, but rejects unknown paths", () => {
		const registry = new SchemaRegistry();
		registry.register(primaryDiagnosisSchema);
		const adapter = buildClinicalSchemaAdapter(
			registry.get("PrimaryDiagnosis", 1)!,
		);

		const partial = adapter.validateRecord(
			{ id: "dx-1", diagnosis: { conceptId: "c1" } },
			"patch",
		);
		expect(partial.valid).toBe(true);

		const unknown = adapter.validateRecord({ nope: 1 }, "patch");
		expect(unknown.valid).toBe(false);

		const manyScalar = adapter.validateRecord(
			{ id: "dx-1", supportingConcepts: { conceptId: "c1" } },
			"patch",
		);
		expect(manyScalar.valid).toBe(false);
	});

	it("keeps registry duplicate-registration protection", () => {
		const registry = new SchemaRegistry();
		registry.register(primaryDiagnosisSchema);
		const adapters = registerClinicalSchemaAdapters(registry);
		expect(() =>
			adapters.register(adapters.get("PrimaryDiagnosis", 1)),
		).toThrow(/already registered/);
	});
});
