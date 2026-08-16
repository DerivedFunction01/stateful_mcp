import { describe, expect, test } from "bun:test";
import { deriveMacroAdapter } from "../src/composition/derivation";
import type { MacroDefinitionAdapter } from "../src/contracts/composition";
import { defineExtension } from "../src/extensions/contracts";
import { extendExtension } from "../src/extensions/derivation";
import { ExtensionRegistry } from "../src/extensions/registry";

describe("Extension Layering & Inheritance (extendExtension)", () => {
	// Base Core Extension
	const baseAdapter: MacroDefinitionAdapter = {
		definition: {
			id: "macro:base-obs",
			name: "obs",
			arguments: [
				{
					argumentId: "concept",
					name: "concept",
					path: "obs.concept",
					matcher: { kind: "pattern", pattern: "#[\\w\\-]+" },
					required: true,
				},
				{
					argumentId: "val",
					name: "val",
					path: "obs.val",
					matcher: { kind: "pattern", pattern: "\\d+" },
					required: false,
				},
			],
		},
		previewTemplate: {
			version: 1,
			parts: [
				{ kind: "literal", text: "obs " },
				{ kind: "slot", argumentId: "concept", occurrence: 0 },
			],
		},
		children: {},
		compile: (_bindings, input) => ({
			kind: "base_obs",
			concept: input.arguments.find((a) => a.name === "concept")?.rawValue,
			source: "base",
		}),
	};

	const baseExtension = defineExtension({
		id: "core-observations",
		version: "1.0.0",
		domainConfig: {
			id: "core-observations",
			version: "1.0.0",
			domainUnits: {
				mg: ["milligram", "mg"],
			},
			bounds: {
				defaultMin: { min: 0 },
			},
		},
		activate: () => {
			return {
				exports: { coreService: true },
				adapters: [baseAdapter],
			};
		},
	});

	test("inherits base extension adapters, overlays domain config, and records requires dependency", async () => {
		// Specialized Derived Extension (e.g. Oncology pack specializing unit aliases and adding specialized macro)
		const specializedAdapter = deriveMacroAdapter(baseAdapter, {
			macroName: "chemo-obs",
			description: "Chemotherapy specific observation",
		});

		const oncologyExtension = extendExtension(baseExtension, {
			id: "oncology-pack",
			version: "2.0.0",
			overrideAdapters: [specializedAdapter],
			domainConfigOverrides: {
				domainUnits: {
					"mg/m2": ["mg/m2", "mg per m2"],
				},
			},
		});

		expect(oncologyExtension.manifest.id).toBe("oncology-pack");
		expect(oncologyExtension.manifest.requires).toContain("core-observations");
		expect(oncologyExtension.manifest.domainConfig?.domainUnits).toHaveProperty("mg/m2");

		// Simulate registry
		const registry = new ExtensionRegistry();
		registry.set({
			manifest: baseExtension.manifest,
			sourceFile: "/app/extensions/base.ts",
			exports: { coreService: true },
			dispose: async () => {},
		});
		registry.set({
			manifest: oncologyExtension.manifest,
			sourceFile: "/app/extensions/oncology.ts",
			exports: { coreService: true },
			dispose: async () => {},
		});

		const activatedBase = await baseExtension.activate({} as any);
		const activatedDerived = await oncologyExtension.activate({} as any);

		expect(activatedBase.adapters).toHaveLength(1);
		expect(activatedBase.adapters![0]?.definition.name).toBe("obs");

		expect(activatedDerived.adapters).toHaveLength(2);
		const adapterNames = activatedDerived.adapters!.map((a) => a.definition.name);
		expect(adapterNames).toContain("obs");
		expect(adapterNames).toContain("chemo-obs");
		expect(activatedDerived.exports).toEqual({ coreService: true });
	});

	test("overrides existing macro adapter when macroName matches and runs custom onActivate lifecycle", async () => {
		let customLifecycleRan = false;

		const overriddenObsAdapter: MacroDefinitionAdapter = {
			...baseAdapter,
			definition: {
				...baseAdapter.definition,
				name: "obs", // Same name as base to override it
			},
			compile: (_bindings, input) => ({
				kind: "overridden_obs",
				concept: input.arguments.find((a) => a.name === "concept")?.rawValue,
				source: "oncology_override",
			}),
		};

		const derivedWithOverride = extendExtension(baseExtension, {
			id: "custom-pack",
			version: "1.1.0",
			overrideAdapters: [overriddenObsAdapter],
			onActivate: () => {
				customLifecycleRan = true;
			},
		});

		const activation = await derivedWithOverride.activate({} as any);
		expect(customLifecycleRan).toBe(true);
		expect(activation.adapters).toHaveLength(1);
		expect(activation.adapters![0]?.definition.name).toBe("obs");

		const compiled = await activation.adapters![0]?.compile!([], {
			macroName: "obs",
			sourceLines: [],
			arguments: [{ name: "concept", rawValue: "#carboplatin", source: "named" }],
			matches: [],
		});

		expect(compiled).toEqual({
			kind: "overridden_obs",
			concept: "#carboplatin",
			source: "oncology_override",
		});
	});
});
