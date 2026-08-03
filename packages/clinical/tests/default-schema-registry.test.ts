import { describe, expect, it } from "bun:test";
import { createDefaultSchemaRegistry } from "../src/schemas/default-registry";

describe("default  schema registry", () => {
	it("registers the published clinical schemas for runtime bootstrap", () => {
		const registry = createDefaultSchemaRegistry();
		expect(registry.get("Observation", 1)).not.toBeNull();
		expect(registry.get("PrimaryDiagnosis", 1)).not.toBeNull();
		expect(registry.get("DifferentialDiagnosis", 1)).not.toBeNull();
		expect(registry.list().length).toBeGreaterThan(10);
	});
});
