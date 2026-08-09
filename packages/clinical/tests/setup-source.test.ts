import { describe, expect, it } from "bun:test";
import { DictionaryStore, InMemoryConceptFilterStore, InMemoryConceptResolver } from "@stateful-mcp/core";
import {
	createDefaultSetupSource,
	compileSetupMacro,
	expandSetupPlacements,
	compileTemporalGrammar,
	matchTemporalGrammar,
	MemorySetupSourceStore,
	validateSetupSource,
	materializeSetupSource,
	publishSetupSource,
	activateSetupSource,
	rollbackSetupSource,
	diffSetupSources,
} from "../src/setup";
import { bootstrapNumericalDefaults } from "../src/bootstrap/bootstrap-config";
import { ClinicalBootstrap } from "../src/bootstrap/bootstrap";
import { StoreBuilder } from "../src/bootstrap/store-builder";

describe("interactive setup source", () => {
	it("round-trips a draft through the source store", async () => {
		const store = new MemorySetupSourceStore();
		const source = createDefaultSetupSource("draft-1");
		await store.set(source);

		expect(await store.get("draft-1")).toEqual(source);
		expect(await store.list()).toHaveLength(1);
	});

	it("materializes concepts, expressions, filters, and generated macros", async () => {
		const source = createDefaultSetupSource("materialize");
		source.concepts.push({
			conceptId: "c-pneumonia",
			namespaceCode: "SNOMED",
			standardCode: "233604007",
			display: "Pneumonia",
		});
		source.expressions.push({
			id: "expr-pna",
			term: "pna",
			lookupTerm: "pna",
			regexPattern: "pna",
			isCaseInsensitive: true,
			conceptId: "c-pneumonia",
			priorityWeight: 1,
			active: true,
		});
		source.conceptFilters.push({
			filterId: "filter-pneumonia",
			conceptId: "c-pneumonia",
			roleName: "Observation.concept",
			policy: "whitelist",
			active: true,
		});
		source.blocks.push({
			blockId: "possible-block",
			version: 1,
			label: "possible",
			kind: "enum",
			target: { targetSchema: "Observation", targetPath: "certainty" },
			valueKind: "enum",
			source: { kind: "generated", recipe: { phrases: ["possible"], caseSensitive: false } },
			schemaVersion: 1,
			status: "draft",
		});
	const filterStore = new InMemoryConceptFilterStore();
		const dictionary = new DictionaryStore(
			new InMemoryConceptResolver({ filterStore }),
			undefined,
			undefined,
			undefined,
			filterStore,
		);
		const macros = new Map<string, unknown>();
		const valueRules = new (await import("../src/values/value-rule-registry")).ValueRuleRegistry();
		const profiles = new Map<string, unknown>();
		const result = await materializeSetupSource(source, {
			dictionary,
			conceptFilterStore: filterStore,
			macroStore: {
				async get() { return null; },
				async list() { return []; },
				async set(macro) { macros.set(macro.macroId, macro); },
			},
			profileStore: {
				async get(id) { return (profiles.get(id) as any) ?? null; },
				async list() { return [...profiles.values()] as any[]; },
				async set(profile) { profiles.set(profile.profileId, profile); },
				async delete(id) { profiles.delete(id); },
			},
			valueRules,
		});

		expect(result.applied).toBe(true);
		expect(result.concepts).toBe(1);
		expect(result.expressions).toBe(1);
		expect(await dictionary.getConcept("c-pneumonia")).not.toBeNull();
		expect(await filterStore.get("filter-pneumonia")).not.toBeNull();
		expect(valueRules.get("default-clinical:values", "possible-block")).not.toBeNull();
	});

	it("validates block and placement references before publication", () => {
		const source = createDefaultSetupSource("invalid");
		source.macros.push({
			macroId: "observation",
			version: 1,
			macroName: "observation",
			targetSchema: "ObservationEvent",
			targetSchemaVersion: 1,
			allowedPlacementIds: ["missing-placement"],
			parameters: [{ argumentId: "concept", blockId: "missing-block" }],
			status: "draft",
		});

		const result = validateSetupSource(source);

		expect(result.valid).toBe(false);
		expect(result.diagnostics.map((item) => item.code)).toEqual([
			"missing_macro_placement",
			"missing_macro_block",
		]);
	});

	it("activates the newest persisted setup source during bootstrap", async () => {
		const stores = await StoreBuilder.fromConfig({ backend: "memory" });
		const source = createDefaultSetupSource("bootstrap-activation");
		source.concepts.push({
			conceptId: "c-activation",
			namespaceCode: "LOCAL",
			standardCode: "activation",
			display: "Activation concept",
		});
		await stores.setupSourceStore.set(source);

		const bootstrap = await ClinicalBootstrap.fromStores(stores);

		expect(await bootstrap.dictionary.getConcept("c-activation")).not.toBeNull();
	});

	it("publishes and activates exactly one source", async () => {
		const store = new MemorySetupSourceStore();
		const first = await publishSetupSource(store, createDefaultSetupSource("first"));
		const second = await publishSetupSource(store, createDefaultSetupSource("second"));

		expect(first.status).toBe("published");
		expect((await activateSetupSource(store, first.sourceId)).status).toBe("active");
		expect((await activateSetupSource(store, second.sourceId)).status).toBe("active");
		expect((await store.get(first.sourceId))?.status).toBe("retired");
		expect((await rollbackSetupSource(store, first.sourceId)).status).toBe("active");
	});

	it("does not bootstrap a merely published source", async () => {
		const stores = await StoreBuilder.fromConfig({ backend: "memory" });
		const source = await publishSetupSource(stores.setupSourceStore, createDefaultSetupSource("published-only"));
		source.concepts.push({
			conceptId: "c-published-only",
			namespaceCode: "LOCAL",
			standardCode: "published-only",
			display: "Published only",
		});
		await stores.setupSourceStore.set(source);
		const bootstrap = await ClinicalBootstrap.fromStores(stores);

		expect(await bootstrap.dictionary.getConcept("c-published-only")).toBeUndefined();
	});

	it("reports semantic source changes", () => {
		const left = createDefaultSetupSource("left");
		const right = createDefaultSetupSource("right");
		right.primitiveProfile.decimalSeparator = ",";
		right.concepts.push({ conceptId: "c", namespaceCode: "LOCAL", standardCode: "c", display: "C" });

		expect(diffSetupSources(left, right).changes).toEqual(["primitiveProfile", "concepts"]);
	});

	it("compiles selected blocks into the existing macro contract", () => {
		const source = createDefaultSetupSource("compile");
		source.blocks.push({
			blockId: "concept-pneumonia",
			version: 1,
			label: "pneumonia",
			kind: "concept",
			target: { targetSchema: "ObservationEvent", targetPath: "concept" },
			valueKind: "concept",
			source: { kind: "concept", conceptId: "c-pneumonia" },
			schemaVersion: 1,
			status: "draft",
		});
		source.macros.push({
			macroId: "observation",
			version: 1,
			macroName: "observation",
			targetSchema: "ObservationEvent",
			targetSchemaVersion: 1,
			allowedPlacementIds: [],
			parameters: [{ argumentId: "concept", blockId: "concept-pneumonia" }],
			status: "draft",
		});

		const macro = compileSetupMacro(source.macros[0]!, source.blocks);

		expect(macro.arguments[0]).toMatchObject({
			argumentId: "concept",
			roleName: "ObservationEvent.concept",
			target: { targetPath: "concept" },
		});
		expect(macro.children).toBeUndefined();
	});

	it("makes rich or custom date children explicit opt-ins", () => {
		const source = createDefaultSetupSource("date-child");
		const base = {
			macroId: "observation",
			version: 1,
			macroName: "observation",
			targetSchema: "Observation",
			targetSchemaVersion: 1,
			allowedPlacementIds: [],
			parameters: [],
			status: "draft" as const,
		};

		const withoutDate = compileSetupMacro(base, source.blocks);
		const withSharedDate = compileSetupMacro(
			{ ...base, dateChild: { mode: "shared", targetPath: "dateRange" } },
			source.blocks,
		);
		const withSimpleDate = compileSetupMacro(
			{
				...base,
				dateChild: {
					mode: "custom",
					childMacroId: "simple-date",
					targetPath: "dateRange",
				},
			},
			source.blocks,
		);

		expect(withoutDate.children).toBeUndefined();
		expect(withSharedDate.children?.[0]?.childMacroName).toBe("date-range");
		expect(withSimpleDate.children?.[0]?.childMacroName).toBe("simple-date");
	});

	it("expands only explicitly enabled fan-out placements", () => {
		const source = createDefaultSetupSource("fan-out");
		source.placements.push(
			{
				placementId: "subjective",
				documentSchema: "SoapNote",
				documentVersion: 1,
				documentPath: "subjective.presentingComplaint",
				targetSchema: "ObservationEvent",
				targetSchemaVersion: 1,
				cardinality: "one",
			},
			{
				placementId: "objective",
				documentSchema: "SoapNote",
				documentVersion: 1,
				documentPath: "objective.clinicalObservations[]",
				targetSchema: "ObservationEvent",
				targetSchemaVersion: 1,
				cardinality: "many",
			},
		);
		const composition = {
			macroId: "observation",
			version: 1,
			macroName: "observation",
			targetSchema: "ObservationEvent",
			targetSchemaVersion: 1,
			allowedPlacementIds: ["subjective", "objective"],
			defaultPlacementId: "subjective",
			parameters: [
				{ argumentId: "concept", blockId: "concept", placementMode: "fan_out" as const },
				{ argumentId: "certainty", blockId: "certainty" },
			],
			status: "draft" as const,
		};

		const operations = expandSetupPlacements(composition, source.placements);

		expect(operations.map((operation) => operation.placementId)).toEqual([
			"subjective",
			"objective",
			"subjective",
		]);
	});

	it("compiles user-defined slot order and constrained gaps", () => {
		const grammar = compileTemporalGrammar({
			grammarId: "date-range",
			template: {
				templateId: "exclusion-first",
				version: 1,
				parts: [
					{ kind: "slot", slotId: "exclusion", blockId: "exclude", required: true },
					{ kind: "slot", slotId: "start", blockId: "start", required: true },
					{ kind: "slot", slotId: "end", blockId: "end", required: true },
				],
				gaps: [
					{
						gapId: "exclusion-start",
						fromSlot: "exclusion",
						toSlot: "start",
						max: 3,
						unit: "words",
						allowedWords: ["before", "the"],
					},
				],
				whitespace: "flexible",
				punctuation: "flexible",
				precedence: 1,
				status: "draft",
			},
			slotPatterns: {
				exclusion: { blockId: "exclude", targetPath: "excludedDatetimes", pattern: "Friday" },
				start: { blockId: "start", targetPath: "time.startDatetime", pattern: "Spring\\s+2023" },
				end: { blockId: "end", targetPath: "time.endDatetime", pattern: "Autumn\\s+2023" },
			},
		});

		expect(grammar.alternatives[0]?.pattern).toContain("exclusion");
		expect(new RegExp(grammar.alternatives[0]!.pattern, "u").test(
			"Friday before Spring 2023Autumn 2023",
		)).toBe(true);
	});

	it("builds enum slot patterns from the active temporal profile", () => {
		const grammar = compileTemporalGrammar({
			grammarId: "weekday",
			template: {
				templateId: "weekday-template",
				version: 1,
				parts: [{ kind: "slot", slotId: "weekday", blockId: "weekday", required: true }],
				gaps: [],
				whitespace: "flexible",
				punctuation: "flexible",
				precedence: 1,
				status: "draft",
			},
			slotPatterns: {
				weekday: {
					blockId: "weekday",
					targetPath: "time.repeat.weekdays",
					enumKind: "day-of-week",
				},
			},
			profile: bootstrapNumericalDefaults.temporal,
		});

		const matcher = new RegExp(grammar.alternatives[0]!.pattern, grammar.alternatives[0]!.flags);
		expect(matcher.test("Monday")).toBe(true);
		expect(matcher.test("Mondayish")).toBe(false);
	});

	it("builds date slots from DateTimeFormatConfig", () => {
		const grammar = compileTemporalGrammar({
			grammarId: "date",
			template: {
				templateId: "date-template",
				version: 1,
				parts: [{ kind: "slot", slotId: "date", blockId: "date", required: true }],
				gaps: [],
				whitespace: "flexible",
				punctuation: "flexible",
				precedence: 1,
				status: "draft",
			},
			slotPatterns: {
				date: {
					blockId: "date",
					targetPath: "time.startDatetime",
					dateTimeConfig: {
						tokens: ["DD", "MM", "YYYY"],
						separators: ["/", "/"],
						options: { exact: true },
					},
				},
			},
		});

		const matcher = new RegExp(grammar.alternatives[0]!.pattern, grammar.alternatives[0]!.flags);
		expect(matcher.test("31/01/2026")).toBe(true);
		expect(matcher.test("2026-01-31")).toBe(false);
		expect(matchTemporalGrammar(grammar, "31/01/2026")).toEqual({
			match: {
				alternativeId: "date-template",
				slots: { date: "31/01/2026" },
				precedence: 1,
			},
			diagnostics: [],
		});
	});
});
