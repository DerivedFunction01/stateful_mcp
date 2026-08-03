import { describe, expect, it } from "bun:test";
import {
	createMemoryConceptStore,
	createMemoryExpressionStore,
	DictionaryStore,
	InMemoryConceptResolver,
	MemoryKvBackend,
} from "@stateful-mcp/core";
import { bootstrapClinicalStores } from "../src/init/bootstrap/bootstrap-writer";
import { validateBootstrapReadiness } from "../src/init/validation/readiness";
import type { ClinicalRuntimeParserStores } from "../src/store/clinical-runtime";
import { KvSharedFieldAnchorStore } from "../src/store/parser/anchors/kv-shared-field-anchor-store";
import { KvConceptDefaultStore } from "../src/store/parser/concept_defaults/kv-concept-default-store";
import { KvConceptFieldStore } from "../src/store/parser/concept_fields/kv-concept-field-store";
import { KvParserProfileStore } from "../src/store/parser/profiles/kv-parser-profile-store";
import { KvParserAttributeRuleStore } from "../src/store/parser/rules/kv-parser-attribute-rule-store";
import { KvParserEvaluatorRuleStore } from "../src/store/parser/rules/kv-parser-evaluator-rule-store";
import { KvProfileEvaluatorBindingStore } from "../src/store/parser/rules/kv-profile-evaluator-binding-store";
import { KvProfileRuleBindingStore } from "../src/store/parser/rules/kv-profile-rule-binding-store";
import { KvProseParserTemplateStore } from "../src/store/reference/prose-parser-templates/kv-prose-parser-template-store";
import { KvClinicalProseTemplateStore } from "../src/store/reference/prose-templates/kv-clinical-prose-template-store";
import { KvStopWordProfileStore } from "../src/store/reference/stop-words/kv-stop-word-profile-store";
import { KvStopWordWordListStore } from "../src/store/reference/stop-words/kv-stop-word-word-list-store";

function makeMockDictionaryStore(): DictionaryStore {
	return new DictionaryStore(
		new InMemoryConceptResolver(),
		createMemoryConceptStore(),
		createMemoryExpressionStore(),
	);
}

function makeMockStores(): ClinicalRuntimeParserStores {
	const backend = new MemoryKvBackend();
	return {
		profiles: new KvParserProfileStore(backend),
		attributeRules: new KvParserAttributeRuleStore(backend),
		evaluatorRules: new KvParserEvaluatorRuleStore(backend),
		attributeBindings: new KvProfileRuleBindingStore(backend),
		evaluatorBindings: new KvProfileEvaluatorBindingStore(backend),
		conceptDefaults: new KvConceptDefaultStore(backend),
		conceptFields: new KvConceptFieldStore(backend),
		sharedFieldAnchors: new KvSharedFieldAnchorStore(backend),
		stopWordProfiles: new KvStopWordProfileStore(backend),
		stopWordWordLists: new KvStopWordWordListStore(backend),
		proseTemplates: new KvClinicalProseTemplateStore(backend),
		proseParserTemplates: new KvProseParserTemplateStore(backend),
		calibration: {} as any,
		personnel: {} as any,
		facilities: {} as any,
		dictionaryStore: makeMockDictionaryStore(),
	};
}

describe("bootstrapClinicalStores dictionary seeding", () => {
	it("writes valid expression to dictionary store", async () => {
		const stores = makeMockStores();
		const result = await bootstrapClinicalStores(
			stores,
			[
				{
					recordId: "expr.rxnorm.123",
					kind: "dictionary_expression",
					payload: {
						term: "myocardial infarction",
						regexPattern: "^myocardial infarction$",
						conceptId: "SNOMED::22298006",
						targetAssignment: "MAIN_TERM",
						active: true,
						priorityWeight: 1,
					},
					sourceModuleId: "test",
					sourceModuleVersion: 1,
				},
			],
			{ seedPolicy: "force" },
		);

		expect(result.recordsWritten.dictionary_expression).toBe(1);
		const expressions = await stores.dictionaryStore.getExpressions();
		expect(expressions.length).toBe(1);
		expect(expressions[0].term).toBe("myocardial infarction");
		expect(expressions[0].conceptId).toBe("SNOMED::22298006");
	});

	it("rejects expression missing required fields", async () => {
		const stores = makeMockStores();
		await bootstrapClinicalStores(
			stores,
			[
				{
					recordId: "expr.missing",
					kind: "dictionary_expression",
					payload: {
						term: "test",
					},
					sourceModuleId: "test",
					sourceModuleVersion: 1,
				},
			],
			{ seedPolicy: "force" },
		);

		const expressions = await stores.dictionaryStore.getExpressions();
		expect(expressions.length).toBe(0);
	});

	it("rejects expression with substring matcher pattern", async () => {
		const stores = makeMockStores();
		await bootstrapClinicalStores(
			stores,
			[
				{
					recordId: "expr.substring",
					kind: "dictionary_expression",
					payload: {
						term: "pain",
						regexPattern: "pain",
						conceptId: "SNOMED::22298006",
						targetAssignment: "MAIN_TERM",
					},
					sourceModuleId: "test",
					sourceModuleVersion: 1,
				},
			],
			{ seedPolicy: "force" },
		);

		const expressions = await stores.dictionaryStore.getExpressions();
		expect(expressions.length).toBe(0);
	});

	it("rejects expression without targetAssignment", async () => {
		const stores = makeMockStores();
		await bootstrapClinicalStores(
			stores,
			[
				{
					recordId: "expr.no-target",
					kind: "dictionary_expression",
					payload: {
						term: "fever",
						regexPattern: "^fever$",
						conceptId: "SNOMED::386661006",
					},
					sourceModuleId: "test",
					sourceModuleVersion: 1,
				},
			],
			{ seedPolicy: "force" },
		);

		const expressions = await stores.dictionaryStore.getExpressions();
		expect(expressions.length).toBe(0);
	});

	it("isStoreEmpty detects existing expressions and skips on if_empty", async () => {
		const stores = makeMockStores();
		await stores.dictionaryStore.addExpression({
			term: "existing",
			regexPattern: "^existing$",
			isCaseInsensitive: false,
			targetAssignment: "MAIN_TERM",
			conceptId: "SNOMED::123",
			priorityWeight: 1,
			active: true,
		});

		const result = await bootstrapClinicalStores(
			stores,
			[
				{
					recordId: "expr.existing",
					kind: "dictionary_expression",
					payload: {
						term: "existing",
						regexPattern: "^existing$",
						conceptId: "SNOMED::123",
						targetAssignment: "MAIN_TERM",
					},
					sourceModuleId: "test",
					sourceModuleVersion: 1,
				},
			],
			{ seedPolicy: "if_empty" },
		);

		expect(result.recordsSkipped.dictionary_expression).toBe(1);
	});

	it("readiness returns degraded when dictionary is empty", async () => {
		const stores = makeMockStores();
		const readiness = await validateBootstrapReadiness(stores);
		expect(readiness).toBe("degraded");
	});

	it("short term emits a preview warning but does not block seeding", async () => {
		const stores = makeMockStores();
		const result = await bootstrapClinicalStores(
			stores,
			[
				{
					recordId: "expr.short",
					kind: "dictionary_expression",
					payload: {
						term: "高",
						regexPattern: "^高$",
						conceptId: "SNOMED::123",
						targetAssignment: "MAIN_TERM",
					},
					sourceModuleId: "test",
					sourceModuleVersion: 1,
				},
			],
			{ seedPolicy: "force" },
		);

		const warningDiagnostics = result.diagnostics.filter(
			(d) => d.severity === "warning",
		);
		expect(warningDiagnostics.length).toBeGreaterThan(0);
		const expressions = await stores.dictionaryStore.getExpressions();
		expect(expressions.length).toBe(1);
	});

	it("writes valid relation to dictionary store", async () => {
		const stores = makeMockStores();
		const result = await bootstrapClinicalStores(
			stores,
			[
				{
					recordId: "rel.snomed-equiv",
					kind: "concept_relation",
					payload: {
						id: "rel.snomed-equiv",
						conceptId: "SNOMED::386661006",
						linkedId: "SNOMED::309429008",
						relationshipType: "NARROWER_THAN",
						active: true,
					},
					sourceModuleId: "test",
					sourceModuleVersion: 1,
				},
			],
			{ seedPolicy: "force" },
		);

		expect(result.recordsWritten.concept_relation).toBe(1);
		const relations = await stores.dictionaryStore.getRelations();
		expect(relations.length).toBe(1);
		expect(relations[0].conceptId).toBe("SNOMED::386661006");
	});

	it("rejects relation missing required fields", async () => {
		const stores = makeMockStores();
		await bootstrapClinicalStores(
			stores,
			[
				{
					recordId: "rel.missing",
					kind: "concept_relation",
					payload: {
						conceptId: "SNOMED::386661006",
					},
					sourceModuleId: "test",
					sourceModuleVersion: 1,
				},
			],
			{ seedPolicy: "force" },
		);

		const relations = await stores.dictionaryStore.getRelations();
		expect(relations.length).toBe(0);
	});

	it("rejects relation with invalid relationshipType", async () => {
		const stores = makeMockStores();
		await bootstrapClinicalStores(
			stores,
			[
				{
					recordId: "rel.invalid-type",
					kind: "concept_relation",
					payload: {
						id: "rel.invalid-type",
						conceptId: "SNOMED::386661006",
						linkedId: "SNOMED::309429008",
						relationshipType: "INVALID_TYPE",
						active: true,
					},
					sourceModuleId: "test",
					sourceModuleVersion: 1,
				},
			],
			{ seedPolicy: "force" },
		);

		const relations = await stores.dictionaryStore.getRelations();
		expect(relations.length).toBe(0);
	});

	it("reports unsupported kinds for unknown kinds", async () => {
		const stores = makeMockStores();
		const result = await bootstrapClinicalStores(
			stores,
			[
				{
					recordId: "unknown.dict",
					kind: "unknown_dictionary_kind",
					payload: {},
					sourceModuleId: "test",
					sourceModuleVersion: 1,
				},
			],
			{ seedPolicy: "force" },
		);

		expect(result.unsupportedKinds.length).toBeGreaterThanOrEqual(1);
		expect(
			result.unsupportedKinds.some((u) => u.kind === "unknown_dictionary_kind"),
		).toBe(true);
	});
});
