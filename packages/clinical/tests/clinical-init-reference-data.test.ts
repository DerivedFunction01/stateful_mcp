import { describe, expect, it } from "bun:test";
import { MemoryKvBackend } from "@stateful-mcp/core";
import { bootstrapClinicalStores } from "../src/init/bootstrap/bootstrap-writer";
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
import { KvFacilityStore } from "../src/store/reference/facilities/kv-facility-store";
import { KvJurisdictionalDisplayStore } from "../src/store/reference/jurisdictional-displays/kv-jurisdictional-display-store";
import { KvPersonnelStore } from "../src/store/reference/personnel/kv-personnel-store";
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
		calibration: {} as any,
		personnel: new KvPersonnelStore(backend),
		facilities: new KvFacilityStore(backend),
		jurisdictionalDisplays: new KvJurisdictionalDisplayStore(backend),
		macros: new KvParserMacroStore(backend),
		dictionaryStore: makeMockDictionaryStore(),
	};
}

describe("bootstrapClinicalStores reference data", () => {
	it("writes personnel records to the personnel store", async () => {
		const stores = makeMockStores();
		const result = await bootstrapClinicalStores(
			stores,
			[
				{
					recordId: "personnel.dr-smith",
					kind: "personnel",
					payload: {
						personnelId: "personnel.dr-smith",
						fullName: "Dr. Smith",
						specialtyCode: "family-medicine",
						facilityId: "facility.main",
					},
					sourceModuleId: "test",
					sourceModuleVersion: 1,
				},
			],
			{ seedPolicy: "force" },
		);

		expect(result.recordsWritten.personnel).toBe(1);
		expect(await stores.personnel.get("personnel.dr-smith")).toEqual({
			personnelId: "personnel.dr-smith",
			fullName: "Dr. Smith",
			specialtyCode: "family-medicine",
			facilityId: "facility.main",
		});
	});

	it("writes facility records to the facilities store", async () => {
		const stores = makeMockStores();
		const result = await bootstrapClinicalStores(
			stores,
			[
				{
					recordId: "facility.main",
					kind: "facility",
					payload: {
						facilityId: "facility.main",
						facilityCode: "MAIN",
						facilityName: "Main Clinic",
						jurisdictionCode: "US-CA",
					},
					sourceModuleId: "test",
					sourceModuleVersion: 1,
				},
			],
			{ seedPolicy: "force" },
		);

		expect(result.recordsWritten.facility).toBe(1);
		expect(await stores.facilities.get("facility.main")).toEqual({
			facilityId: "facility.main",
			facilityCode: "MAIN",
			facilityName: "Main Clinic",
			jurisdictionCode: "US-CA",
		});
	});

	it("writes jurisdictional display records to the jurisdictional displays store", async () => {
		const stores = makeMockStores();
		const result = await bootstrapClinicalStores(
			stores,
			[
				{
					recordId: "display.snomed.us",
					kind: "jurisdictional_display",
					payload: {
						conceptId: "123456",
						jurisdictionId: "US",
						preferredDisplay: "Preferred term",
						fullySpecifiedName: "Fully specified term",
						source: "SNOMED",
					},
					sourceModuleId: "test",
					sourceModuleVersion: 1,
				},
			],
			{ seedPolicy: "force" },
		);

		expect(result.recordsWritten.jurisdictional_display).toBe(1);
		expect(
			await stores.jurisdictionalDisplays.get("123456", "US", "SNOMED"),
		).toEqual({
			conceptId: "123456",
			jurisdictionId: "US",
			preferredDisplay: "Preferred term",
			fullySpecifiedName: "Fully specified term",
			source: "SNOMED",
		});
	});

	it("writes macro records to the macros store", async () => {
		const stores = makeMockStores();
		const result = await bootstrapClinicalStores(
			stores,
			[
				{
					recordId: "macro.vitals",
					kind: "macro",
					payload: {
						macroId: "macro.vitals",
						macroName: "vitals",
						macroTemplate: "#vitals {1}",
					},
					sourceModuleId: "test",
					sourceModuleVersion: 1,
				},
			],
			{ seedPolicy: "force" },
		);

		expect(result.recordsWritten.macro).toBe(1);
		expect(await stores.macros.get("vitals")).toEqual({
			macroId: "macro.vitals",
			macroName: "vitals",
			macroTemplate: "#vitals {1}",
		});
	});

	it("skips reference data records when seedPolicy is never", async () => {
		const stores = makeMockStores();
		const result = await bootstrapClinicalStores(
			stores,
			[
				{
					recordId: "personnel.dr-smith",
					kind: "personnel",
					payload: {
						personnelId: "personnel.dr-smith",
						fullName: "Dr. Smith",
						specialtyCode: "family-medicine",
						facilityId: "facility.main",
					},
					sourceModuleId: "test",
					sourceModuleVersion: 1,
				},
			],
			{ seedPolicy: "never" },
		);

		expect(result.recordsSkipped.personnel).toBe(1);
		expect(await stores.personnel.get("personnel.dr-smith")).toBeNull();
	});

	it("reports unsupported kinds for unknown reference data kinds", async () => {
		const stores = makeMockStores();
		const result = await bootstrapClinicalStores(
			stores,
			[
				{
					recordId: "unknown.record",
					kind: "unknown_kind",
					payload: {},
					sourceModuleId: "test",
					sourceModuleVersion: 1,
				},
			],
			{ seedPolicy: "force" },
		);

		expect(result.unsupportedKinds.length).toBeGreaterThanOrEqual(1);
		expect(result.unsupportedKinds.some((u) => u.kind === "unknown_kind")).toBe(
			true,
		);
	});
});
