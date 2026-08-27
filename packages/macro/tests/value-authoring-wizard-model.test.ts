import { describe, expect, test } from "bun:test";
import type {
	SettingsDiagnosticDto,
	ValueAuthoringProfileDto,
	ValueAuthoringResult,
	ValueCatalogDto,
	ValueSampleResultDto,
} from "@stateful-mcp/macro-protocol";
import {
	analyzeDateTimeSource,
	createDeferred,
	createFixtureAuthoringPort,
	createValueAuthoringWizard,
	evaluateStepGuards,
	GUARD_CODES,
	listOrderedFormatIds,
} from "../src/workspace/config/wizard";
import type { ScheduleFn } from "../src/workspace/config/wizard/scheduler";
import { immediateSchedule } from "../src/workspace/config/wizard/scheduler";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const baseProfile: ValueAuthoringProfileDto = {
	id: "base",
	label: "Base",
	numberWords: { atoms: { one: "1" }, scales: [] },
	values: {
		numeric: { decimalSeparator: ".", thousandsSeparator: "," },
		dateTime: {
			formats: {
				"date.iso": {
					id: "date.iso",
					kind: "date",
					source: "YYYY-MM-DD",
				},
			},
		},
	},
	aliases: [
		{
			id: "alias.a1",
			namespace: "canonical-id",
			spellings: ["usd"],
			target: { kind: "canonical", value: "USD" },
		},
	],
	fundamentals: [
		{
			id: "fund.temp",
			variants: [{ id: "v1", slots: [{ id: "s1", pattern: "\\d+" }] }],
		},
	],
	recipes: [
		{
			id: "recipe.r1",
			root: { kind: "terminal", consumerId: "text" },
			priority: 10,
			outputBuilderId: "quantity.builder",
			capability: { valueKind: "number" },
			enabled: true,
		},
	],
};

const derivedProfile: ValueAuthoringProfileDto = {
	id: "derived",
	extends: "base",
	locale: "en-US",
	aliases: [
		{
			id: "alias.a1",
			namespace: "canonical-id",
			spellings: ["$"],
			target: { kind: "canonical", value: "USD" },
		},
		{
			id: "alias.a2",
			namespace: "literal",
			spellings: ["euro"],
			target: { kind: "literal", value: "EUR" },
		},
	],
	fundamentals: [
		{
			id: "fund.local",
			variants: [{ id: "lv", slots: [{ id: "ls", parserId: "text" }] }],
		},
	],
	recipes: [
		{
			id: "recipe.r1",
			root: { kind: "fundamental", groupId: "fund.local" },
			priority: 5,
			enabled: false,
			outputBuilderId: "quantity.builder",
			capability: { valueKind: "number" },
		},
	],
};

const catalog: ValueCatalogDto = {
	valueKinds: ["number"],
	terminalIds: ["text", "number"],
	recipes: [],
	providerIds: ["quantity"],
};

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

interface HarnessOptions {
	readonly scheduler?: "immediate" | "manual";
	readonly activeProfileId?: string;
	readonly supportedScopes?: readonly ("user" | "workspace" | "folder")[];
	readonly portSpec?: Parameters<typeof createFixtureAuthoringPort>[0];
}

function createManualScheduler() {
	type Task = { fn: () => void; cancelled: boolean };
	const tasks: Task[] = [];
	const schedule: ScheduleFn = (fn) => {
		const task = { fn, cancelled: false };
		tasks.push(task);
		return {
			cancel() {
				task.cancelled = true;
			},
		};
	};
	return {
		schedule,
		runAll() {
			for (const task of [...tasks]) if (!task.cancelled) task.fn();
			tasks.length = 0;
		},
	};
}

async function flush(): Promise<void> {
	let chain = Promise.resolve();
	for (let index = 0; index < 8; index += 1)
		chain = chain.then(() => undefined);
	await chain;
}

function buildHarness(options: HarnessOptions = {}) {
	const fixture = createFixtureAuthoringPort({
		catalog,
		revisions: { derived: "rev1", base: "rev1-base" },
		profiles: { base: baseProfile, derived: derivedProfile },
		...(options.portSpec ?? {}),
	});
	const scheduler =
		options.scheduler === "manual" ? createManualScheduler() : null;
	const store = createValueAuthoringWizard(fixture.port, {
		schedule: scheduler
			? scheduler.schedule
			: (immediateSchedule satisfies ScheduleFn),
		activeProfileId: options.activeProfileId ?? "active-runtime",
		supportedScopes: options.supportedScopes ?? ["user", "workspace", "folder"],
		resolveParentProfile: (parentId) =>
			parentId === "base"
				? (JSON.parse(JSON.stringify(baseProfile)) as ValueAuthoringProfileDto)
				: null,
	});
	return {
		store,
		fixture,
		scheduler,
		async settle() {
			scheduler?.runAll();
			await flush();
		},
	};
}

interface FixtureDraft {
	profile: ValueAuthoringProfileDto;
	dirty: false;
	diagnostics: readonly SettingsDiagnosticDto[];
	compileStatus: "valid" | "invalid" | "empty";
	graphFingerprint: string;
	revision: string;
}

function draftOf(
	profile: ValueAuthoringProfileDto,
	revision: string,
	compileStatus: "valid" | "invalid" | "empty",
	diagnostics: readonly SettingsDiagnosticDto[] = [],
): FixtureDraft {
	return {
		profile: JSON.parse(JSON.stringify(profile)),
		dirty: false,
		diagnostics: [...diagnostics],
		compileStatus,
		graphFingerprint: "fp-fixture",
		revision,
	};
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("value authoring wizard model", () => {
	test("starts unready at scope-profile with typed initial state", () => {
		const { store } = buildHarness();
		const state = store.getState();
		expect(state.ready).toBe(false);
		expect(state.step).toBe("scope-profile");
		expect(state.editedProfileId).toBeNull();
		expect(state.preview.previewPersisted).toBe(false);
		expect(state.activation.available).toBe(false);
	});

	test("five-step happy path traverses all steps after load", async () => {
		const { store } = buildHarness({ scheduler: "manual" });
		expect(await store.actions.startEdit("derived")).toBe(true);
		expect(store.actions.goToStep("numerics-lexicon")).toBe(true);
		expect(store.actions.goToStep("base-templates")).toBe(true);
		expect(store.actions.goToStep("combinators")).toBe(true);
		expect(store.actions.goToStep("sandbox")).toBe(true);
		expect(store.getState().step).toBe("sandbox");
	});

	test("navigation guards deny unresolved profiles and malformed syntax per decision table", async () => {
		const unloaded = buildHarness();
		expect(unloaded.store.actions.goToStep("numerics-lexicon")).toBe(false);
		const denial = unloaded.store
			.getState()
			.guardDenials.find((entry) => entry.to === "numerics-lexicon");
		expect(denial?.code).toBe(GUARD_CODES.profileNotResolved);

		const malformedDraft = draftOf(
			{
				id: "broken",
				aliases: [],
				fundamentals: [],
				recipes: [{ id: "r", root: { kind: "terminal", consumerId: "text" } }],
			},
			"rev-m",
			"invalid",
			[
				{
					severity: "error",
					code: "TEMPLATE_SYNTAX_MALFORMED",
					messageKey: "settings.values.parseError",
					path: ["values", "dateTime", "formats", "bad"],
				},
			],
		);
		const broken = buildHarness({
			portSpec: {
				loadImpl: async () =>
					({
						status: "loaded",
						settingsRevision: "rev-m",
						draft: malformedDraft,
					}) satisfies ValueAuthoringResult,
			},
		});
		expect(await broken.store.actions.startEdit("broken")).toBe(true);
		expect(broken.store.actions.goToStep("base-templates")).toBe(false);
		const templateDenial = broken.store
			.getState()
			.guardDenials.find((entry) => entry.to === "base-templates");
		expect(templateDenial?.code).toBe(GUARD_CODES.malformedSyntaxFailure);
		expect(broken.store.actions.goToStep("numerics-lexicon")).toBe(true);
		expect(broken.store.actions.goToStep("sandbox")).toBe(false);

		const decisions = evaluateStepGuards(broken.store.getState());
		expect(decisions["scope-profile"].enterable).toBe(true);
		expect(decisions["numerics-lexicon"].enterable).toBe(true);
		expect(decisions["base-templates"].enterable).toBe(false);
		expect(decisions["sandbox"].enterable).toBe(false);
	});

	test("combinators guard distinguishes catalog-unavailable from reference failures", async () => {
		const ghostGroup = JSON.parse(
			JSON.stringify({
				...derivedProfile,
				recipes: [
					{ id: "r1", root: { kind: "fundamental", groupId: "ghost.group" } },
				],
			}),
		) as ValueAuthoringProfileDto;

		const noCatalog = buildHarness({
			portSpec: { profiles: { ghost: ghostGroup }, catalog: undefined },
		});
		await noCatalog.store.actions.startEdit("ghost");
		expect(noCatalog.store.actions.goToStep("combinators")).toBe(false);
		expect(noCatalog.store.getState().guardDenials.at(-1)?.code).toBe(
			GUARD_CODES.catalogUnavailable,
		);

		const withCatalog = buildHarness({
			portSpec: { profiles: { ghost: ghostGroup }, catalog },
		});
		await withCatalog.store.actions.startEdit("ghost");
		expect(withCatalog.store.actions.goToStep("combinators")).toBe(false);
		expect(withCatalog.store.getState().guardDenials.at(-1)?.code).toBe(
			GUARD_CODES.referencesUnresolved,
		);

		const healthy = buildHarness();
		await healthy.store.actions.startEdit("derived");
		expect(healthy.store.actions.goToStep("combinators")).toBe(true);
	});

	test("provenance matrix across base→derived inheritance", async () => {
		const { store } = buildHarness();
		await store.actions.startEdit("derived");
		const provenance = store.getState().provenance;
		expect(provenance["aliases:alias.a1"]).toBe("replaced");
		expect(provenance["aliases:alias.a2"]).toBe("local");
		expect(provenance["fundamentals:fund.temp"]).toBe("inherited");
		expect(provenance["dateTimeFormats:date.iso"]).toBe("inherited");
		// enabled:false outranks replaced
		expect(provenance["recipes:recipe.r1"]).toBe("disabled");

		const entries = store.view.stableIdEntries();
		const a1 = entries.find((entry) => entry.id === "alias.a1");
		expect(a1?.inheritedDefinition).toMatchObject({ spellings: ["usd"] });
		expect(a1?.definition).toMatchObject({ spellings: ["$"] });
		const temp = entries.find((entry) => entry.id === "fund.temp");
		expect(temp?.provenance).toBe("inherited");

		store.actions.addToCollection("aliases", {
			id: "alias.a3",
			namespace: "literal",
			spellings: ["km"],
			target: { kind: "literal", value: "KILOMETER" },
		});
		expect(store.getState().provenance["aliases:alias.a3"]).toBe("appended");
	});

	test("tombstone removal hides entries without deleting inherited data; reset restores", async () => {
		const { store } = buildHarness();
		await store.actions.startEdit("derived");

		expect(
			store.actions.removeFromCollection("aliases", "alias.a2"),
		).toBeTrue();
		let state = store.getState();
		expect(state.localProfile?.removedIds?.aliases).toEqual(["alias.a2"]);
		expect(state.provenance["aliases:alias.a2"]).toBeUndefined();
		expect(
			store.view.stableIdEntries().some((entry) => entry.id === "alias.a2"),
		).toBeFalse();

		// tombstoned inherited entry disappears from the view too
		expect(
			store.actions.removeFromCollection("aliases", "alias.a1"),
		).toBeTrue();
		state = store.getState();
		expect(state.localProfile?.removedIds?.aliases).toEqual([
			"alias.a1",
			"alias.a2",
		]);
		expect(
			store.view.stableIdEntries().some((entry) => entry.id === "alias.a1"),
		).toBeFalse();

		expect(store.actions.resetToInherited("aliases", "alias.a1")).toBeTrue();
		state = store.getState();
		// discarding the local override demotes the entry to plain inherited
		expect(state.provenance["aliases:alias.a1"]).toBe("inherited");
		expect(state.localProfile?.removedIds?.aliases).toEqual(["alias.a2"]);
	});

	test("numeric edits produce protocol-shaped values.numeric diffs once after settle", async () => {
		const { store, fixture, scheduler } = buildHarness({
			scheduler: "manual",
		});
		await store.actions.startEdit("derived");
		store.actions.setNumericOption("decimalSeparator", ",");
		store.actions.setNumericOption("decimalSeparator", ";");
		store.actions.toggleNumericForm("fraction", true);
		store.actions.toggleNumericForm("integer", true);
		store.actions.toggleNumericForm("scientific", true);
		store.actions.setNumberWordAtom("twenty", "20");
		store.actions.setNumberWordScales([
			{ word: "thousand", value: 1000, type: "major" },
		]);
		expect(fixture.calls.filter((call) => call.op === "validate").length).toBe(
			0,
		); // nothing sent before debounce settles
		scheduler?.runAll();
		await flush();

		expect(fixture.calls.filter((call) => call.op === "validate").length).toBe(
			1,
		);
		const localValues = (store.getState().localProfile?.values ?? {}) as Record<
			string,
			unknown
		>;
		const numeric = localValues.numeric as Record<string, unknown>;
		expect(numeric.decimalSeparator).toBe(";");
		expect(numeric.allowedForms).toEqual(["integer", "fraction", "scientific"]);
		expect(store.getState().dirty).toBe(true);
		expect(store.getState().validation.valid).toBe(true);
		expect(store.getState().validation.status).toBe("settled");

		expect(store.getState().localProfile?.numberWords?.atoms).toMatchObject({
			twenty: "20",
		});
		store.actions.setNumberWordAtom("one", null);
		expect(
			store.getState().localProfile?.numberWords?.atoms ?? {},
		).not.toHaveProperty("one");
	});

	test("live example trigger schedules preview exactly once per debounce settle", async () => {
		const { store, fixture, scheduler } = buildHarness({
			scheduler: "manual",
		});
		await store.actions.startEdit("derived");
		store.actions.setSandboxSamples([{ input: "1,234.5" }]);
		store.actions.runSandbox();
		store.actions.runSandbox();
		store.actions.runSandbox();
		expect(fixture.calls.filter((call) => call.op === "preview").length).toBe(
			0,
		); // queued, not transported
		scheduler?.runAll();
		await flush();
		expect(fixture.calls.filter((call) => call.op === "preview").length).toBe(
			1,
		);
		const previewCall = fixture.calls.find((call) => call.op === "preview");
		expect(previewCall?.payload).toMatchObject({
			options: {
				samples: [{ input: "1,234.5" }],
				expectedRevision: "rev1",
			},
		});
		expect(store.getState().preview.status).toBe("settled");
		expect(store.getState().preview.results.length).toBe(1);
	});

	test("template add/reorder/priority/edit round-trips into values.dateTime.formats", async () => {
		const { store, scheduler } = buildHarness({ scheduler: "manual" });
		await store.actions.startEdit("derived");
		store.actions.addDateTimeFormat({
			id: "f.eu",
			kind: "date",
			source: "DD/MM/YYYY",
			parserPriority: 5,
		});
		store.actions.addDateTimeFormat({
			id: "f.raw",
			kind: "datetime",
			source: "{BOGUS}",
		});
		store.actions.setDateTimeFormatEnabled("f.eu", false);
		store.actions.editDateTimeFormatSource("f.raw", "{BOGUS}/HH");

		// priority ordering drives deterministic sequence; unprioritized last
		store.actions.setDateTimeFormatPriority("f.eu", 1);
		expect(listOrderedFormatIds(store.getState().localProfile)).toEqual([
			"f.eu",
			"f.raw",
		]);

		const formats = (
			(
				store.getState().localProfile?.values as
					| Record<string, unknown>
					| undefined
			)?.dateTime as
				| Record<string, Record<string, Record<string, unknown>>>
				| undefined
		)?.formats as Record<string, Record<string, unknown>>;
		expect(formats["f.eu"]).toMatchObject({
			source: "DD/MM/YYYY",
			parserPriority: 1,
			parserEnabled: false,
		});
		expect(formats["f.raw"]?.source).toBe("{BOGUS}/HH"); // verbatim

		// unknown tokens are analyzed locally and do not block save
		const analysis = analyzeDateTimeSource("{BOGUS}");
		expect(analysis.unknownTokens.map((segment) => segment.text)).toEqual([
			"BOGUS",
		]);
		scheduler?.runAll();
		await flush();
		expect(await store.actions.save()).toBe(true);
		expect(store.getState().saveState.kind).toBe("saved");
	});

	test("sandbox stale preview response discarded when superseded", async () => {
		const first = createDeferred<ValueAuthoringResult>();
		let callCount = 0;
		const lateSamples: ValueSampleResultDto[] = [
			{ input: "old", matched: true, diagnostics: [] },
		];
		const currentSamples: ValueSampleResultDto[] = [
			{ input: "current", matched: false, diagnostics: [] },
		];
		const { store } = buildHarness({
			portSpec: {
				previewImpl: async (_hooks, _profile, _options) => {
					callCount += 1;
					if (callCount === 1) return first.promise;
					return {
						status: "previewed",
						settingsRevision: "rev1",
						draft: draftOf(derivedProfile, "rev1", "valid"),
						preview: {
							graphFingerprint: "fp-current",
							samples: currentSamples,
						},
					} satisfies ValueAuthoringResult;
				},
			},
		});
		await store.actions.startEdit("derived");
		store.actions.setSandboxSamples([{ input: "1" }]);
		await store.actions.runSandbox(); // token 1 pending on deferred
		await flush();
		await store.actions.runSandbox(); // token 2 resolves immediately
		await flush();

		first.resolve({
			status: "previewed",
			settingsRevision: "rev1",
			draft: draftOf(derivedProfile, "rev1", "valid", []),
			preview: { graphFingerprint: "fp-old", samples: lateSamples },
		});
		await flush();

		const state = store.getState();
		expect(callCount).toBe(2);
		expect(state.preview.staleCount).toBe(1);
		expect(state.preview.status).toBe("settled");
		expect(state.preview.results).toEqual(currentSamples);
		expect(state.dirty).toBe(false); // superseded echo left state consistent
	});

	test("sandbox run with invalid graph rejected before transport", async () => {
		const invalidLoad: ValueAuthoringResult = {
			status: "loaded",
			settingsRevision: "rev-inv",
			draft: draftOf(
				{ id: "inv", aliases: [], fundamentals: [], recipes: [] },
				"rev-inv",
				"invalid",
				[
					{
						severity: "error",
						code: "UNKNOWN_RECIPE",
						messageKey: "values.recipe.unknownRecipe",
					},
				],
			),
		};
		const harness = buildHarness({
			portSpec: { loadImpl: async () => invalidLoad },
		});
		await harness.store.actions.startEdit("inv");
		await harness.store.actions.runSandbox();
		const state = harness.store.getState();
		expect(state.preview.status).toBe("rejected");
		expect(state.preview.rejectedCode).toBe("GRAPH_INVALID_PREVIEW_REJECTED");
		expect(state.preview.reasonKey).toBe("settings.preview.diagnostic");
		expect(
			harness.fixture.calls.filter((call) => call.op === "preview").length,
		).toBe(0);
	});

	test("sandbox sample rows normalized; presentation selections isolated from transport", async () => {
		const { store } = buildHarness();
		await store.actions.startEdit("derived");
		store.actions.setSandboxSamples([
			{ input: "  42 km  ", argumentId: " distance " },
			{ input: "   " },
			{ input: "" },
		]);
		expect(store.getState().preview.samples).toEqual([
			{ input: "42 km", argumentId: "distance" },
		]);
		store.actions.selectSampleRecipe("recipe.r1");
		store.actions.showSandboxRejected(true);
		expect(store.getState().preview.selectedRecipeId).toBe("recipe.r1");
		expect(store.getState().preview.showRejected).toBe(true);
		expect(store.getState().preview.previewPersisted).toBe(false);
	});

	test("save lifecycle: saved bumps baseline, resets dirty, re-baselines provenance", async () => {
		const { store, fixture, scheduler } = buildHarness({
			scheduler: "manual",
		});
		await store.actions.startEdit("derived");
		store.actions.addToCollection("aliases", {
			id: "alias.a3",
			namespace: "literal",
			spellings: ["km"],
			target: { kind: "literal", value: "KILOMETER" },
		});
		expect(store.getState().provenance["aliases:alias.a3"]).toBe("appended");
		store.actions.setNumericOption("allowNegative", true);
		scheduler?.runAll();
		await flush();
		expect(await store.actions.save()).toBe(true);
		const state = store.getState();
		expect(state.baselineRevision).toBe("rev2");
		expect(state.dirty).toBe(false);
		expect(state.saveState.kind).toBe("saved");
		// previously session-appended entry rebased into the loaded layer
		expect(state.provenance["aliases:alias.a3"]).toBe("local");
		expect(Object.keys(fixture.profiles.derived?.removedIds ?? {})).toEqual(
			Object.keys(
				(fixture.profiles.derived?.removedIds as Record<string, unknown>) ?? {},
			),
		);
		// eligible for activation (valid, edited ≠ active) yet activation stayed off during save
		expect(state.activeProfileId).toBe("active-runtime");
	});

	test("blocked save merges server diagnostics into step-indexed fields", async () => {
		const blockedDiagnostics: SettingsDiagnosticDto[] = [
			{
				severity: "error",
				code: "NUMERIC_BOUNDS",
				messageKey: "settings.diagnostic.invalidValue",
				path: ["values", "numeric", "decimalSeparator"],
			},
			{
				severity: "warning",
				code: "TEMPLATE_HINT",
				messageKey: "settings.values.parseError",
				path: ["recipes", "recipe.r1"],
			},
			{
				severity: "error",
				messageKey: "settings.diagnostic.invalidValue",
				path: ["extends"],
			},
		];
		const { store } = buildHarness({
			portSpec: {
				saveImpl: async () =>
					({
						status: "blocked",
						diagnostics: blockedDiagnostics,
						validation: {
							valid: false,
							diagnostics: blockedDiagnostics,
							graphFingerprint: "fp-blocked",
						},
					}) satisfies ValueAuthoringResult,
			},
		});
		await store.actions.startEdit("derived");
		store.actions.setNumericOption("decimalSeparator", ",");
		await flush();
		expect(await store.actions.save()).toBe(false);
		const state = store.getState();
		expect(state.saveState.kind).toBe("blocked");
		const fields = Object.keys(state.fieldDiagnostics);
		expect(fields).toContain("numerics.decimalSeparator");
		expect(fields).toContain("combinators.recipe.r1");
		expect(fields).toContain("scope-profile.extends");
		expect(state.validation.valid).toBe(false);
		expect(state.validation.diagnostics).toHaveLength(3);
	});

	test("stale expectedRevision yields conflict; navigation freezes until acknowledged", async () => {
		const { store, fixture, scheduler } = buildHarness({
			scheduler: "manual",
		});
		await store.actions.startEdit("derived");
		store.actions.goToStep("numerics-lexicon");
		store.actions.setNumericOption("decimalSeparator", ",");
		scheduler?.runAll();
		await flush();

		// external edit moves the revision behind the model's back
		fixture.revisions.derived = "rev9";

		expect(await store.actions.save()).toBe(false);
		let state = store.getState();
		expect(state.conflict?.code).toBe("SETTINGS_REVISION_STALE");
		expect(state.conflict?.expectedRevision).toBe("rev1");
		expect(state.conflict?.actualRevision).toBe("rev9");
		expect(state.conflict?.originStep).toBe("numerics-lexicon");
		expect(state.saveState.kind).toBe("idle");

		// navigation out of the conflicting step is frozen
		expect(store.actions.goToStep("base-templates")).toBe(false);
		state = store.getState(); // denial recorded on the fresh snapshot
		expect(state.guardDenials.at(-1)?.code).toBe(GUARD_CODES.conflictFrozen);
		// same-step navigation stays allowed
		expect(store.actions.goToStep("numerics-lexicon")).toBe(true);

		expect(await store.actions.acknowledgeConflict()).toBe(true);
		await flush();
		state = store.getState();
		expect(state.conflict).toBeNull();
		expect(state.baselineRevision).toBe("rev9");
		expect(state.dirty).toBe(true); // local edits preserved across reload

		expect(await store.actions.save()).toBe(true);
		expect(store.getState().baselineRevision).toBe("rev10");
	});

	test("double-save suppressed while a save is pending", async () => {
		const pending = createDeferred<ValueAuthoringResult>();
		const { store, fixture } = buildHarness({
			portSpec: {
				saveImpl: async () => pending.promise,
			},
		});
		await store.actions.startEdit("derived");
		store.actions.setNumericOption("allowFractions", true);
		await flush();

		const firstPromise = store.actions.save();
		expect(store.getState().saveState.kind).toBe("saving");
		expect(await store.actions.save()).toBe(false); // suppressed while pending
		pending.resolve({
			status: "saved",
			settingsRevision: "rev2",
			draft: draftOf(derivedProfile, "rev2", "valid", []),
		});
		expect(await firstPromise).toBe(true);
		expect(store.getState().saveState.kind).toBe("saved");
		expect(fixture.calls.filter((call) => call.op === "save")).toHaveLength(1);
	});

	test("malformed-port payload surfaces structured retryable error state", async () => {
		const malformed: ValueAuthoringResult = {
			status: "conflict",
			code: "REQUEST_PAYLOAD_MALFORMED",
			messageKey: "request.payload.malformed",
		};
		let fail = true;
		const { store } = buildHarness({
			portSpec: {
				loadImpl: async () =>
					fail
						? malformed
						: ({
								status: "loaded",
								settingsRevision: "rev-ok",
								draft: draftOf(derivedProfile, "rev-ok", "valid", []),
								catalog,
							} satisfies ValueAuthoringResult),
			},
		});
		expect(await store.actions.startEdit("derived")).toBe(false);
		let lastError = store.getState().lastError;
		expect(lastError?.code).toBe("REQUEST_PAYLOAD_MALFORMED");
		expect(lastError?.messageKey).toBe("request.payload.malformed");
		expect(lastError?.retryable).toBe(true);
		expect(lastError?.retryPayload?.profileId).toBe("derived");
		expect(store.getState().ready).toBe(false);

		fail = false;
		expect(await store.actions.retryLast()).toBe(true);
		lastError = store.getState().lastError;
		expect(lastError).toBeNull();
		expect(store.getState().ready).toBe(true);
		expect(store.getState().editedProfileId).toBe("derived");
	});

	test("transport throw surfaces structured error without corrupting state", async () => {
		const { store } = buildHarness({
			portSpec: {
				saveImpl: async () => {
					throw new Error("boom");
				},
			},
		});
		await store.actions.startEdit("derived");
		store.actions.setNumericOption("allowNegative", true);
		await flush();
		expect(await store.actions.save()).toBe(false);
		const state = store.getState();
		expect(state.lastError?.code).toBe("TRANSPORT_ERROR");
		expect(state.lastError?.messageKey).toBe("errors.transportFailed");
		expect(state.lastError?.op).toBe("save");
		expect(state.lastError?.retryable).toBe(true);
		expect(state.saveState.kind).toBe("idle");
		expect(state.conflict).toBeNull();
		expect(state.dirty).toBe(true); // draft preserved for retry

		store.actions.clearLastError();
		expect(store.getState().lastError).toBeNull();
	});

	test("activation is separate from save and honors port capability", async () => {
		const activated: string[] = [];
		const withActivate = buildHarness({
			portSpec: {
				activate: async (profileId: string) => {
					activated.push(profileId);
				},
			},
		});
		await withActivate.store.actions.startEdit("derived");
		await withActivate.settle();
		const state = withActivate.store.getState();
		expect(state.activation.available).toBe(true);
		expect(state.activation.eligible).toBe(true);

		withActivate.scheduler?.runAll();
		await flush();
		await withActivate.store.actions.save();
		// save did NOT activate implicitly
		expect(withActivate.store.getState().activeProfileId).toBe(
			"active-runtime",
		);
		expect(await withActivate.store.actions.activate()).toBe(true);
		expect(activated).toEqual(["derived"]);
		expect(withActivate.store.getState().activeProfileId).toBe("derived");
		expect(withActivate.store.getState().activation.eligible).toBe(false);

		const withoutActivate = buildHarness({ activeProfileId: "x" });
		await withoutActivate.store.actions.startEdit("derived");
		await withoutActivate.settle();
		expect(withoutActivate.store.getState().activation.available).toBe(false);
		expect(await withoutActivate.store.actions.activate()).toBe(false);
	});

	test("new-local mode migrates an empty editable layer off a base profile", () => {
		const { store } = buildHarness();
		expect(
			store.actions.startNewLocal({
				id: "local-variant",
				label: "Local variant",
				extends: "base",
				locale: "en-US",
			}),
		).toBe(true);
		const state = store.getState();
		expect(state.ready).toBe(true);
		expect(state.editedExtendsId).toBe("base");
		expect(state.parentMissing).toBe(false);
		expect(state.inheritedEntryIds.recipes).toEqual(["recipe.r1"]);
		expect(state.localProfile?.aliases).toEqual([]);
		expect(
			store.view.stableIdEntries().find((entry) => entry.id === "recipe.r1")
				?.provenance,
		).toBe("inherited");
	});

	test("unavailable scope surfaces structured reason without switching", () => {
		const { store } = buildHarness({
			supportedScopes: ["user", "workspace"],
		});
		expect(store.actions.chooseScope("folder")).toBe(false);
		const availability = store
			.getState()
			.scopeAvailability.find((item) => item.scope === "folder");
		expect(availability?.supported).toBe(false);
		expect(availability?.reasonKey).toBe("settings.bundle.scopeUnsupported");
		expect(store.getState().scope).toBeNull();
		expect(store.actions.chooseScope("user")).toBe(true);
		expect(store.getState().scope).toBe("user");
	});

	test("refreshBaseline pulls external settings.changed updates into an untouched draft", async () => {
		const { store, fixture } = buildHarness();
		await store.actions.startEdit("derived");
		fixture.profiles.derived = {
			...derivedProfile,
			numberWords: { atoms: { nine: "9" } },
		};
		fixture.revisions.derived = "rev-ext";
		expect(await store.actions.refreshBaseline()).toBe(true);
		const state = store.getState();
		expect(state.baselineRevision).toBe("rev-ext");
		expect(state.dirty).toBe(false);
		expect(state.localProfile?.numberWords?.atoms).toMatchObject({ nine: "9" });
	});

	test("subscribe notifies with frozen snapshots and dispose detaches listeners", async () => {
		const { store } = buildHarness();
		let notifications = 0;
		const unsubscribe = store.subscribe(() => {
			notifications += 1;
		});
		await store.actions.startEdit("derived");
		store.actions.setNumericOption("allowScientific", true);
		await flush();
		expect(notifications).toBeGreaterThan(0);
		unsubscribe();
		const before = notifications;
		store.actions.clearLastError();
		expect(notifications).toBe(before);
		store.dispose();
		const snapshot = store.getState();
		expect(Object.isFrozen(snapshot)).toBe(true);
		expect(Object.isFrozen(snapshot.validation)).toBe(true);
		expect(Object.isFrozen(snapshot.preview.samples)).toBe(true);
	});
});
