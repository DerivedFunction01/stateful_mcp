import { describe, expect, it } from "bun:test";
import {
	DEFAULT_CLINICAL_INIT_CONFIG,
	loadClinicalInitSeedModules,
	resolveClinicalInitConfig,
	resolveVariations,
	STARTER_CLINICAL_INIT_MANIFEST,
	validateClinicalInitConfig,
	validateClinicalInitSeedManifest,
	validateLoadedVariations,
} from "../src/init";
import {
	ClinicalInitConfigDiagnosticCode,
	ClinicalInitSeedDiagnosticCode,
} from "../src/init/types";

describe("Clinical initialization contracts", () => {
	it("preserves current runtime behavior when init is absent", () => {
		const config = resolveClinicalInitConfig();

		expect(config).toEqual(DEFAULT_CLINICAL_INIT_CONFIG);
		expect(config.enabled).toBe(false);
		expect(config.seedSource).toBe("none");
		expect(config.seedPolicy).toBe("never");
	});

	it("merges init configuration without mutating defaults", () => {
		const config = resolveClinicalInitConfig({
			enabled: true,
			seedSource: "starter",
			expansion: { enabled: true, sources: { vocabulary: "local" } },
		});

		expect(config.enabled).toBe(true);
		expect(config.seedSource).toBe("starter");
		expect(config.expansion).toEqual({
			enabled: true,
			lazy: true,
			sources: { vocabulary: "local" },
		});
		expect(DEFAULT_CLINICAL_INIT_CONFIG.enabled).toBe(false);
	});

	it("validates incompatible initialization policies", () => {
		const diagnostics = validateClinicalInitConfig({
			enabled: true,
			seedPolicy: "force",
			seedSource: "none",
		});

		expect(diagnostics.map((diagnostic) => diagnostic.code)).toContain(
			ClinicalInitConfigDiagnosticCode.FORCE_SEED_WITHOUT_SOURCE,
		);
	});

	it("contains the complete language-neutral starter record kinds", () => {
		const diagnostics = validateClinicalInitSeedManifest(
			STARTER_CLINICAL_INIT_MANIFEST,
		);

		expect(diagnostics).toEqual([]);
		expect(STARTER_CLINICAL_INIT_MANIFEST.modules).toHaveLength(7);
	});

	it("loads selected modules with dependencies and provenance", async () => {
		const records = await loadClinicalInitSeedModules(
			STARTER_CLINICAL_INIT_MANIFEST,
			["starter.temporal"],
		);

		expect([
			...new Set(records.map((record) => record.sourceModuleId)),
		]).toEqual(["starter.profile", "starter.temporal"]);
		expect(records.every((record) => record.sourceModuleVersion === 1)).toBe(
			true,
		);
	});

	it("reports missing starter dependencies and duplicate module IDs", () => {
		const manifest = {
			...STARTER_CLINICAL_INIT_MANIFEST,
			modules: [
				...STARTER_CLINICAL_INIT_MANIFEST.modules,
				{
					moduleId: "starter.profile",
					version: 1,
					kinds: ["profile" as const],
					format: "typed" as const,
					load: async () => [],
				},
				{
					moduleId: "broken",
					version: 1,
					kinds: ["field_rule" as const],
					requires: ["missing"],
					format: "typed" as const,
					load: async () => [],
				},
			],
		};
		const diagnostics = validateClinicalInitSeedManifest(manifest);

		expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
			expect.arrayContaining([
				ClinicalInitSeedDiagnosticCode.DUPLICATE_SEED_MODULE_ID,
				ClinicalInitSeedDiagnosticCode.MISSING_SEED_MODULE_DEPENDENCY,
			]),
		);
	});

	it("resolves variations by highest priority", async () => {
		const records = await loadClinicalInitSeedModules(
			STARTER_CLINICAL_INIT_MANIFEST,
			["starter.variations"],
		);

		const resolutions = resolveVariations(records);
		const dateResolution = resolutions.find(
			(r) => r.variationGroup === "date.primary",
		);

		expect(dateResolution).toBeDefined();
		expect(dateResolution!.selectedVariationId).toBe("variation.date.primary");
		expect(dateResolution!.selectedPriority).toBe(100);
		expect(dateResolution!.allVariationIds).toContain("variation.date.primary");
		expect(dateResolution!.allVariationIds).toContain(
			"variation.date.european",
		);
		expect(dateResolution!.allVariationIds).toContain(
			"variation.date.named-month",
		);
	});

	it("resolves tag variations by first policy", async () => {
		const records = await loadClinicalInitSeedModules(
			STARTER_CLINICAL_INIT_MANIFEST,
			["starter.variations"],
		);

		const resolutions = resolveVariations(records);
		const tagResolution = resolutions.find(
			(r) => r.variationGroup === "tag.observation",
		);

		expect(tagResolution).toBeDefined();
		expect(tagResolution!.ambiguityPolicy).toBe("first");
		expect(tagResolution!.selectedVariationId).toBe(
			"variation.tag.observation",
		);
	});

	it("validates loaded variations for duplicates and overlaps", async () => {
		const records = await loadClinicalInitSeedModules(
			STARTER_CLINICAL_INIT_MANIFEST,
			["starter.variations"],
		);

		const diagnostics = validateLoadedVariations(records);
		expect(diagnostics).toEqual([]);
	});

	it("detects duplicate variation IDs", async () => {
		const records = await loadClinicalInitSeedModules(
			STARTER_CLINICAL_INIT_MANIFEST,
			["starter.variations"],
		);

		const original = records.find(
			(r) => r.variationId === "variation.date.primary",
		)!;
		const duplicate = {
			...original,
			recordId: "variation.date.primary.duplicate",
			variationId: "variation.date.primary",
		};
		const diagnostics = validateLoadedVariations([...records, duplicate]);

		expect(diagnostics.map((diagnostic) => diagnostic.code)).toContain(
			ClinicalInitSeedDiagnosticCode.DUPLICATE_VARIATION_ID,
		);
	});
});
