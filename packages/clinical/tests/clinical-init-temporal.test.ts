import { describe, expect, it } from "bun:test";
import { MemoryKvBackend } from "@stateful-mcp/core";
import { bootstrapClinicalStores } from "../src/init/bootstrap/bootstrap-writer";
import { compileTemporalRecord } from "../src/init/bootstrap/normalizers/temporal";
import { validateBootstrapReadiness } from "../src/init/validation/readiness";
import type { ClinicalRuntimeParserStores } from "../src/store/clinical-runtime";
import { KvConceptDefaultStore } from "../src/store/parser/concept_defaults/kv-concept-default-store";
import { KvConceptFieldStore } from "../src/store/parser/concept_fields/kv-concept-field-store";
import { KvParserProfileStore } from "../src/store/parser/profiles/kv-parser-profile-store";
import { KvParserAttributeRuleStore } from "../src/store/parser/rules/kv-parser-attribute-rule-store";
import { KvParserEvaluatorRuleStore } from "../src/store/parser/rules/kv-parser-evaluator-rule-store";
import { KvProfileEvaluatorBindingStore } from "../src/store/parser/rules/kv-profile-evaluator-binding-store";
import { KvProfileRuleBindingStore } from "../src/store/parser/rules/kv-profile-rule-binding-store";
import { KvClinicalProseTemplateStore } from "../src/store/reference/prose-templates/kv-clinical-prose-template-store";
import { KvStopWordProfileStore } from "../src/store/reference/stop-words/kv-stop-word-profile-store";
import { KvStopWordWordListStore } from "../src/store/reference/stop-words/kv-stop-word-word-list-store";

function makeMockDictionaryStore(): any {
	return {
		addExpression: async (_expr: any) => {},
		addRelation: async (_rel: any) => {},
		getExpressions: async () => [],
		getRelations: async () => [],
		getAllowedTargetAssignments: () => undefined,
	};
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
		stopWordProfiles: new KvStopWordProfileStore(backend),
		stopWordWordLists: new KvStopWordWordListStore(backend),
		proseTemplates: new KvClinicalProseTemplateStore(backend),
		calibration: {} as any,
		personnel: {} as any,
		facilities: {} as any,
		dictionaryStore: makeMockDictionaryStore(),
		jurisdictionalDisplays: {} as any,
	};
}

const PROFILE_ID = "starter.default";

describe("compileTemporalRecord", () => {
	it("compiles date_pattern into DateTimeFormatConfig", () => {
		const result = compileTemporalRecord({
			recordId: "test.date-pattern",
			kind: "date_pattern",
			profileId: PROFILE_ID,
			payload: {
				tokens: ["YYYY", "MM", "DD"],
				separators: ["-", "-"],
			},
			sourceModuleId: "test",
			sourceModuleVersion: 1,
		});

		expect(result).not.toBeNull();
		expect(result!.calendarDateFormats).toHaveLength(1);
		expect(result!.calendarDateFormats![0].tokens).toEqual([
			"YYYY",
			"MM",
			"DD",
		]);
		expect(result!.calendarDateFormats![0].separators).toEqual(["-", "-"]);
	});

	it("compiles time_pattern into DateTimeFormatConfig", () => {
		const result = compileTemporalRecord({
			recordId: "test.time-pattern",
			kind: "time_pattern",
			profileId: PROFILE_ID,
			payload: {
				tokens: ["HH", "min"],
				separators: [":"],
			},
			sourceModuleId: "test",
			sourceModuleVersion: 1,
		});

		expect(result).not.toBeNull();
		expect(result!.calendarDateFormats).toHaveLength(1);
		expect(result!.calendarDateFormats![0].tokens).toEqual(["HH", "min"]);
		expect(result!.calendarDateFormats![0].separators).toEqual([":"]);
	});

	it("normalizes legacy minute token to min", () => {
		const result = compileTemporalRecord({
			recordId: "test.time-pattern",
			kind: "time_pattern",
			profileId: PROFILE_ID,
			payload: {
				tokens: ["HH", "minute"],
				separators: [":"],
			},
			sourceModuleId: "test",
			sourceModuleVersion: 1,
		});

		expect(result).not.toBeNull();
		expect(result!.calendarDateFormats![0].tokens).toEqual(["HH", "min"]);
	});

	it("returns empty result for empty calendar_vocabulary", () => {
		const result = compileTemporalRecord({
			recordId: "test.calendar-vocabulary",
			kind: "calendar_vocabulary",
			profileId: PROFILE_ID,
			payload: { monthNames: {}, dayOfWeek: {}, dayPeriods: {} },
			sourceModuleId: "test",
			sourceModuleVersion: 1,
		});

		expect(result).not.toBeNull();
		expect(result!.calendarDateFormats).toBeUndefined();
		expect(result!.attributeRules).toBeUndefined();
	});

	it("returns empty result for empty payloads", () => {
		const kinds: Array<{
			kind:
				| "relative_time_rule"
				| "range_rule"
				| "cadence_rule"
				| "exclusion_rule";
		}> = [
			{ kind: "relative_time_rule" },
			{ kind: "range_rule" },
			{ kind: "cadence_rule" },
			{ kind: "exclusion_rule" },
		];

		for (const { kind } of kinds) {
			const result = compileTemporalRecord({
				recordId: `test.${kind}`,
				kind,
				profileId: PROFILE_ID,
				payload: kind === "range_rule" ? {} : { sequences: [] },
				sourceModuleId: "test",
				sourceModuleVersion: 1,
			});

			expect(result).not.toBeNull();
			expect(result!.attributeRules).toBeUndefined();
			expect(result!.conceptFieldRules).toBeUndefined();
		}
	});

	it("rejects malformed payloads", () => {
		expect(
			compileTemporalRecord({
				recordId: "test.bad",
				kind: "date_pattern",
				profileId: PROFILE_ID,
				payload: null as any,
				sourceModuleId: "test",
				sourceModuleVersion: 1,
			}),
		).toBeNull();
	});
});

describe("bootstrapClinicalStores temporal kinds", () => {
	const baseProfile = {
		profileId: PROFILE_ID,
		personnelId: "p1",
		tagToken: "#",
		stateDelimiter: "||",
		stateStartDelimiter: "|",
		stateEndDelimiter: "|",
		macroStartToken: "^",
		variableStartToken: "{",
		variableEndToken: "}",
		isDefault: true,
		attributeRules: [],
		evaluatorRules: [],
		schemaNamespaces: {},
		stopWordThreshold: 0.6,
		calendarDateFormats: [],
		numericFieldFormats: [],
		boundaryDelimiter: "",
		transitionalWords: [],
	};

	it("writes date_pattern to profile calendarDateFormats", async () => {
		const stores = makeMockStores();
		await stores.profiles.set(baseProfile as any);

		const result = await bootstrapClinicalStores(
			stores,
			[
				{
					recordId: "test.date-pattern",
					kind: "date_pattern",
					profileId: PROFILE_ID,
					payload: {
						tokens: ["YYYY", "MM", "DD"],
						separators: ["-", "-"],
					},
					sourceModuleId: "test",
					sourceModuleVersion: 1,
				},
			],
			{ seedPolicy: "force" },
		);

		expect(result.recordsWritten.date_pattern).toBe(1);
		const profile = await stores.profiles.get(PROFILE_ID);
		expect(profile?.calendarDateFormats).toHaveLength(1);
		expect(profile!.calendarDateFormats![0].tokens).toEqual([
			"YYYY",
			"MM",
			"DD",
		]);
	});

	it("writes attribute rules for relative_time_rule", async () => {
		const stores = makeMockStores();
		await stores.profiles.set(baseProfile as any);
		await bootstrapClinicalStores(
			stores,
			[
				{
					recordId: "test.relative-time",
					kind: "relative_time_rule",
					profileId: PROFILE_ID,
					payload: {
						sequences: [
							{
								patterns: ["(?<direction>ago)", "(?<direction>from now)"],
								targetField: "relative_time",
								targetValue: "relative",
								priority: 50,
							},
						],
					},
					sourceModuleId: "test",
					sourceModuleVersion: 1,
				},
			],
			{ seedPolicy: "force" },
		);

		const rules = await stores.attributeRules.list();
		expect(rules.some((r) => r.targetField === "relative_time")).toBe(true);
		const profile = await stores.profiles.get(PROFILE_ID);
		expect(
			profile?.attributeRules?.some((r) => r.targetField === "relative_time"),
		).toBe(true);
	});

	it("writes range_rule attribute rules, concept field rules, and anchors", async () => {
		const stores = makeMockStores();
		await stores.profiles.set(baseProfile as any);
		await bootstrapClinicalStores(
			stores,
			[
				{
					recordId: "test.range",
					kind: "range_rule",
					profileId: PROFILE_ID,
					payload: {
						sequences: [
							{
								patterns: ["from\\s+(?<start>.+?)\\s+to\\s+(?<end>.+)"],
								targetField: "range_boundary",
								targetValue: "range",
							},
						],
						startTarget: "startDatetime",
						endTarget: "endDatetime",
						conceptId: "SNOMED::123",
						targetSchema: "ClinicalDateRange",
						anchorSchema: "VitalsMeasurementEvent",
						anchorField: "context.temporalContext",
					},
					sourceModuleId: "test",
					sourceModuleVersion: 1,
				},
			],
			{ seedPolicy: "force" },
		);

		const rules = await stores.attributeRules.list();
		expect(rules.some((r) => r.targetField === "range_boundary")).toBe(true);

		const fieldRules = await stores.conceptFields.list();
		expect(
			fieldRules.some(
				(f) =>
					f.fieldPath === "startDatetime" &&
					f.targetSchema === "ClinicalDateRange",
			),
		).toBe(true);
	});

	it("skips bootstrap when if_empty and rules already exist", async () => {
		const stores = makeMockStores();
		await stores.profiles.set(baseProfile as any);
		const record = {
			recordId: "test.range",
			kind: "range_rule" as const,
			profileId: PROFILE_ID,
			payload: {
				sequences: [
					{
						patterns: ["from\\s+(?<start>.+?)\\s+to\\s+(?<end>.+)"],
						targetField: "range_boundary",
						targetValue: "range",
					},
				],
				startTarget: "startDatetime",
				endTarget: "endDatetime",
				conceptId: "SNOMED::123",
				targetSchema: "ClinicalDateRange",
				anchorSchema: "VitalsMeasurementEvent",
				anchorField: "context.temporalContext",
			},
			sourceModuleId: "test",
			sourceModuleVersion: 1,
		};

		await bootstrapClinicalStores(stores, [record], { seedPolicy: "force" });
		const result2 = await bootstrapClinicalStores(stores, [record], {
			seedPolicy: "if_empty",
		});

		expect(result2.recordsSkipped.range_rule).toBe(1);
		expect(result2.recordsWritten.range_rule).toBeUndefined();
	});
});

describe("readiness with temporal data", () => {
	it("remains ready when optional temporal data is absent", async () => {
		const stores = makeMockStores();
		const profile = {
			profileId: PROFILE_ID,
			personnelId: "p1",
			tagToken: "#",
			stateDelimiter: "||",
			stateStartDelimiter: "|",
			stateEndDelimiter: "|",
			macroStartToken: "^",
			variableStartToken: "{",
			variableEndToken: "}",
			isDefault: true,
			attributeRules: [],
			evaluatorRules: [],
			schemaNamespaces: {},
			stopWordThreshold: 0.6,
			calendarDateFormats: [],
			numericFieldFormats: [],
			boundaryDelimiter: "",
			transitionalWords: [],
		} as any;
		await stores.profiles.set(profile);

		await bootstrapClinicalStores(
			stores,
			[
				{
					recordId: "test.dict",
					kind: "dictionary_expression",
					profileId: PROFILE_ID,
					payload: {
						term: "fever",
						regexPattern: "^fever$",
						conceptId: "SNOMED::386661006",
						targetAssignment: "MAIN_TERM",
					},
					sourceModuleId: "test",
					sourceModuleVersion: 1,
				},
			],
			{ seedPolicy: "force" },
		);

		const readiness = await validateBootstrapReadiness(stores);
		expect(readiness).toBe("bootstrap-ready");
	});
});
