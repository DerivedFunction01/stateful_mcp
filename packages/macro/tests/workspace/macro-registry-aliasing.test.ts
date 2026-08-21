import { describe, expect, it } from "bun:test";
import type { MacroSpec } from "../../src/contracts/macro";
import { MacroRegistryStore } from "../../src/extensions/registry";

describe("MacroRegistryStore: Aliasing, Disambiguation & Provenance", () => {
	const clinicalVitals: MacroSpec = {
		id: "@stateful-mcp/clinical:vitals",
		name: "vitals",
		arguments: [
			{ argumentId: "bp", name: "bp", path: "bp" },
			{ argumentId: "hr", name: "hr", path: "hr" },
		],
		metadata: {
			aliases: ["v", "vits"],
		},
	};

	const appleHealthVitals: MacroSpec = {
		id: "@stateful-mcp/apple-health:vitals",
		name: "vitals",
		arguments: [
			{ argumentId: "bp", name: "bp", path: "bp" },
			{ argumentId: "steps", name: "steps", path: "steps" },
		],
		metadata: {
			aliases: ["apple-vitals"],
		},
	};

	it("registers macros under canonical ID and primary name", () => {
		const registry = new MacroRegistryStore();
		registry.register(clinicalVitals, "clinical");

		const resolved = registry.resolve("vitals");
		expect(resolved).toBeDefined();
		expect(resolved!.macro.canonicalId).toBe("@stateful-mcp/clinical:vitals");
		expect(resolved!.resolvedVia).toBe("primaryName");
	});

	it("resolves macros via built-in extension aliases", () => {
		const registry = new MacroRegistryStore();
		registry.register(clinicalVitals, "clinical");

		const resolved = registry.resolve("v");
		expect(resolved).toBeDefined();
		expect(resolved!.macro.canonicalId).toBe("@stateful-mcp/clinical:vitals");
		expect(resolved!.resolvedVia).toBe("extensionAlias");
	});

	it("resolves qualified prefix triggers (e.g. clinical:vitals)", () => {
		const registry = new MacroRegistryStore();
		registry.register(clinicalVitals, "clinical");
		registry.register(appleHealthVitals, "apple-health");

		const resolvedClinical = registry.resolve("clinical:vitals");
		expect(resolvedClinical).toBeDefined();
		expect(resolvedClinical!.macro.canonicalId).toBe(
			"@stateful-mcp/clinical:vitals",
		);
		expect(resolvedClinical!.resolvedVia).toBe("qualifiedPrefix");

		const resolvedApple = registry.resolve("apple-health:vitals");
		expect(resolvedApple).toBeDefined();
		expect(resolvedApple!.macro.canonicalId).toBe(
			"@stateful-mcp/apple-health:vitals",
		);
		expect(resolvedApple!.resolvedVia).toBe("qualifiedPrefix");
	});

	it("resolves project aliases overriding default collision", () => {
		const registry = new MacroRegistryStore();
		registry.register(clinicalVitals, "clinical");
		registry.register(appleHealthVitals, "apple-health");

		// User mapped "vitals" to apple-health in .macro/project.json
		const resolved = registry.resolve("vitals", {
			projectAliases: {
				vitals: "@stateful-mcp/apple-health:vitals",
			},
		});

		expect(resolved).toBeDefined();
		expect(resolved!.macro.canonicalId).toBe(
			"@stateful-mcp/apple-health:vitals",
		);
		expect(resolved!.resolvedVia).toBe("projectAlias");
	});

	it("detects cross-extension name collisions and prioritizes active profile extension", () => {
		const registry = new MacroRegistryStore();
		registry.register(clinicalVitals, "clinical");
		registry.register(appleHealthVitals, "apple-health");

		// Without activeExtensionIds, returns collision warning
		const resolvedGeneral = registry.resolve("vitals");
		expect(resolvedGeneral).toBeDefined();
		expect(resolvedGeneral!.collisionWarning).toContain("Ambiguous");

		// With activeExtensionIds: ["apple-health"]
		const resolvedActive = registry.resolve("vitals", {
			activeExtensionIds: ["apple-health"],
		});
		expect(resolvedActive).toBeDefined();
		expect(resolvedActive!.macro.canonicalId).toBe(
			"@stateful-mcp/apple-health:vitals",
		);
		expect(resolvedActive!.collisionWarning).toContain("Resolved to active");
	});
});
