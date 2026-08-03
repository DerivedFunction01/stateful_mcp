import { describe, expect, it } from "bun:test";
import { createDefaultV2SchemaRegistry } from "../src/v2/schemas/default-registry";

describe("default V2 schema registry", () => {
	it("registers the published clinical schemas for runtime bootstrap", () => {
		const registry = createDefaultV2SchemaRegistry();
		expect(registry.get("Observation", 1)).not.toBeNull();
		expect(registry.get("PrimaryDiagnosis", 1)).not.toBeNull();
		expect(registry.get("DifferentialDiagnosis", 1)).not.toBeNull();
		expect(registry.list().length).toBeGreaterThan(10);
	});
});
