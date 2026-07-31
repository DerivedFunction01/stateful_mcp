import { describe, expect, it } from "bun:test";
import { MemoryKvBackend } from "@stateful-mcp/core";
import { bootstrapClinicalStores } from "../src/init/bootstrap/bootstrap-writer";
import {
	resolveClinicalInitConfig,
	validateClinicalInitConfig,
} from "../src/init/config";
import { initializeClinicalRuntime } from "../src/init/orchestrator";
import {
	loadClinicalInitSeedModules,
	resolveVariations,
	STARTER_CLINICAL_INIT_MANIFEST,
	validateClinicalInitSeedManifest,
	validateLoadedVariations,
} from "../src/init/seed/manifest";
import type { ClinicalInitConfig } from "../src/init/types";
import { validateBootstrapReadiness } from "../src/init/validation/readiness";
import type { ClinicalStoreConfig } from "../src/store/clinical-config";
import type { ClinicalRuntimeParserStores } from "../src/store/clinical-runtime";
import { KvSharedFieldAnchorStore } from "../src/store/parser/anchors/kv-shared-field-anchor-store";
import { KvConceptDefaultStore } from "../src/store/parser/concept_defaults/kv-concept-default-store";
import { KvConceptFieldStore } from "../src/store/parser/concept_fields/kv-concept-field-store";
import { KvParserMacroStore } from "../src/store/parser/macros/kv-macro-store";
import { KvParserProfileStore } from "../src/store/parser/profiles/kv-parser-profile-store";
import { KvProfileTagStore } from "../src/store/parser/profiles/kv-profile-tag-store";
import { KvParserAttributeRuleStore } from "../src/store/parser/rules/kv-parser-attribute-rule-store";
import { KvParserEvaluatorRuleStore } from "../src/store/parser/rules/kv-parser-evaluator-rule-store";
import { KvProfileEvaluatorBindingStore } from "../src/store/parser/rules/kv-profile-evaluator-binding-store";
import { KvProfileRuleBindingStore } from "../src/store/parser/rules/kv-profile-rule-binding-store";
import { KvTagStore } from "../src/store/parser/tags/kv-tag-store";
import { KvProseParserTemplateStore } from "../src/store/reference/prose-parser-templates/kv-prose-parser-template-store";
import { KvClinicalProseTemplateStore } from "../src/store/reference/prose-templates/kv-clinical-prose-template-store";
import { KvStopWordProfileStore } from "../src/store/reference/stop-words/kv-stop-word-profile-store";
import { KvStopWordWordListStore } from "../src/store/reference/stop-words/kv-stop-word-word-list-store";

function makeMockDictionaryStore() {
	const expressions: any[] = [];
	const relations: any[] = [];
	return {
		addExpression: async (expr: any) => {
			expressions.push(expr);
			return expr.id;
		},
		addRelation: async (rel: any) => {
			relations.push(rel);
		},
		getExpressions: async () => expressions,
		getRelations: async () => relations,
		getAllowedTargetAssignments: () => undefined,
	};
}

function makeMockStores(): ClinicalRuntimeParserStores {
	const backend = new MemoryKvBackend();
	return {
		profiles: new KvParserProfileStore(backend),
		profileTags: new KvProfileTagStore(backend),
		attributeRules: new KvParserAttributeRuleStore(backend),
		evaluatorRules: new KvParserEvaluatorRuleStore(backend),
		attributeBindings: new KvProfileRuleBindingStore(backend),
		evaluatorBindings: new KvProfileEvaluatorBindingStore(backend),
		tags: new KvTagStore(backend),
		conceptDefaults: new KvConceptDefaultStore(backend),
		conceptFields: new KvConceptFieldStore(backend),
		sharedFieldAnchors: new KvSharedFieldAnchorStore(backend),
		stopWordProfiles: new KvStopWordProfileStore(backend),
		stopWordWordLists: new KvStopWordWordListStore(backend),
		proseTemplates: new KvClinicalProseTemplateStore(backend),
		proseParserTemplates: new KvProseParserTemplateStore(backend),
		macros: new KvParserMacroStore(backend),
		jurisdictionalDisplays: {} as any,
		calibration: {} as any,
		personnel: {} as any,
		facilities: {} as any,
		dictionaryStore: makeMockDictionaryStore(),
	};
}

function makeConfig(
	overrides: Partial<ClinicalInitConfig> = {},
): ClinicalStoreConfig {
	return {
		version: 1,
		domains: {} as any,
		init: {
			enabled: true,
			mode: "bootstrap",
			seedPolicy: "never",
			validate: "none",
			registerSchemas: false,
			seedSource: "starter",
			expansion: { enabled: false, lazy: true, sources: {} },
			...overrides,
		},
		seeds: {} as any,
	};
}

describe("initializeClinicalRuntime", () => {
	it("returns a report with not-checked readiness when init is disabled", async () => {
		const config = makeConfig({ enabled: false });
		const runtime = { config, parserStores: makeMockStores() };
		const report = await initializeClinicalRuntime(runtime, config);

		expect(report.completedPhases).toContain("config");
		expect(report.completedPhases).toContain("storage");
		expect(report.completedPhases).toContain("bootstrap");
		expect(report.completedPhases).toContain("validation");
		expect(report.readiness).toBe("not-checked");
		expect(report.source).toBe("none");
	});

	it("returns a report with packaged-starter source when starter source is used", async () => {
		const config = makeConfig({ seedSource: "starter" });
		const runtime = { config, parserStores: makeMockStores() };
		const report = await initializeClinicalRuntime(runtime, config);

		expect(report.source).toBe("packaged-starter");
		expect(report.completedPhases).toContain("bootstrap");
		expect(report.completedPhases).toContain("validation");
	});

	it("produces diagnostics for invalid config with force seed and no source", async () => {
		const config = makeConfig({
			enabled: true,
			seedPolicy: "force",
			seedSource: "none",
		});
		const runtime = { config, parserStores: makeMockStores() };
		const report = await initializeClinicalRuntime(runtime, config);

		const forceErrors = report.diagnostics.filter(
			(d) => d.code === "FORCE_SEED_WITHOUT_SOURCE",
		);
		expect(forceErrors.length).toBeGreaterThan(0);
	});
});

describe("bootstrapClinicalStores", () => {
	it("skips all records when seedPolicy is never", async () => {
		const stores = makeMockStores();
		const records = await loadClinicalInitSeedModules();
		const result = await bootstrapClinicalStores(stores, records, {
			seedPolicy: "never",
		});

		const totalWritten = Object.values(result.recordsWritten).reduce(
			(a, b) => a + (b ?? 0),
			0,
		);
		expect(totalWritten).toBe(0);
	});

	it("reports unsupported kinds in diagnostics", async () => {
		const stores = makeMockStores();
		const records = await loadClinicalInitSeedModules();
		const result = await bootstrapClinicalStores(stores, records, {
			seedPolicy: "force",
		});

		expect(Array.isArray(result.unsupportedKinds)).toBe(true);
	});

	it("writes parser prose templates to the parser template store", async () => {
		const stores = makeMockStores();
		const result = await bootstrapClinicalStores(
			stores,
			[
				{
					recordId: "parser-template-record",
					kind: "prose_parser_template",
					payload: {
						templateId: "parser-template",
						targetSchema: "ObservationEvent",
						sectionPattern: "(?<value>.+)",
						slots: [],
					},
					sourceModuleId: "test",
					sourceModuleVersion: 1,
				},
			],
			{ seedPolicy: "force" },
		);

		expect(result.recordsWritten.prose_parser_template).toBe(1);
		expect(
			await stores.proseParserTemplates.get("parser-template"),
		).not.toBeNull();
	});
});

describe("validateBootstrapReadiness", () => {
	it("returns degraded when no profiles exist", async () => {
		const stores = makeMockStores();
		const readiness = await validateBootstrapReadiness(stores);
		expect(readiness).toBe("degraded");
	});

	it("returns bootstrap-ready when minimum parser set is present", async () => {
		const stores = makeMockStores();
		await stores.profiles.set({
			profileId: "starter.default",
			tagToken: "#",
			stateDelimiter: "||",
			attributeRules: [],
			evaluatorRules: [],
			schemaNamespaces: {},
			stopWordThreshold: 0.5,
			calendarDateFormats: [],
			numericFieldFormats: [],
			boundaryDelimiter: "",
			transitionalWords: [],
		});
		await stores.attributeBindings.bind(
			"starter.default",
			"starter.attribute-rules",
			1,
		);
		await stores.evaluatorBindings.bind(
			"starter.default",
			"starter.evaluator-rules",
			1,
		);
		await stores.profileTags.setProfileTags("starter.default", [
			"tag.observation",
		]);
		await stores.stopWordProfiles.set({
			profileId: "default",
			personnelId: "default",
			localeFiles: [],
			specialtyFiles: [],
			customWords: [],
			wordListIds: [],
			excludedWords: [],
			additionalWords: [],
		});
		await stores.conceptDefaults.set({
			anchorConceptId: "test",
			targetSchema: "ObservationEvent",
			regexPatterns: [],
			defaultProperties: {},
		});
		await stores.sharedFieldAnchors.set({
			ruleId: "test-anchor",
			source: "ObservationEvent",
			target: "ObservationEvent",
			targetField: "value",
			distance: 100,
			boundaryDelimiter: "",
			transitionalWords: [],
		});
		await stores.proseTemplates.set({
			templateId: "test-template",
			targetSchema: "ObservationEvent",
			slotPosition: "opening",
			templateText: "test",
			slots: {},
		});
		await stores.proseParserTemplates.set({
			templateId: "test-parser-template",
			targetSchema: "ObservationEvent",
			sectionPattern: "(?<value>.+)",
			slots: [],
		});
		await stores.conceptFields.set({
			ruleId: "test-field",
			conceptId: "test",
			targetSchema: "ObservationEvent",
			fieldPath: "value",
		});
		await stores.dictionaryStore.addExpression({
			id: "test-expr",
			term: "test",
			regexPattern: "^test$",
			isCaseInsensitive: false,
			targetAssignment: "MAIN_TERM",
			conceptId: "SNOMED::123",
			priorityWeight: 1,
			active: true,
		});

		const readiness = await validateBootstrapReadiness(stores);
		expect(readiness).toBe("bootstrap-ready");
	});
});

describe("seed module loading and variation resolution", () => {
	it("loadClinicalInitSeedModules returns records with provenance", async () => {
		const records = await loadClinicalInitSeedModules();
		expect(records.length).toBeGreaterThan(0);
		expect(records[0]).toHaveProperty("sourceModuleId");
		expect(records[0]).toHaveProperty("sourceModuleVersion");
	});

	it("resolveVariations groups variation records by variationGroup", async () => {
		const records = await loadClinicalInitSeedModules();
		const resolutions = resolveVariations(records);
		expect(Array.isArray(resolutions)).toBe(true);
	});

	it("validateClinicalInitSeedManifest validates module structure", async () => {
		const diagnostics = validateClinicalInitSeedManifest(
			STARTER_CLINICAL_INIT_MANIFEST,
		);
		const errors = diagnostics.filter((d) => d.severity === "error");
		expect(errors.length).toBe(0);
	});

	it("validateLoadedVariations returns diagnostics array", async () => {
		const records = await loadClinicalInitSeedModules();
		const diagnostics = validateLoadedVariations(records);
		expect(Array.isArray(diagnostics)).toBe(true);
	});
});

describe("init config resolution", () => {
	it("resolveClinicalInitConfig returns defaults when no config is provided", () => {
		const resolved = resolveClinicalInitConfig();
		expect(resolved.enabled).toBe(false);
		expect(resolved.seedSource).toBe("none");
	});

	it("validateClinicalInitConfig produces diagnostics for incompatible combinations", () => {
		const diagnostics = validateClinicalInitConfig({
			enabled: false,
			seedSource: "starter",
		});
		expect(diagnostics.length).toBeGreaterThan(0);
	});
});
