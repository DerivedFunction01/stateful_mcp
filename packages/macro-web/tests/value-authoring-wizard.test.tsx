import { describe, expect, test } from "bun:test";
import {
	createFixtureAuthoringPort,
	createValueAuthoringWizard,
	immediateSchedule,
	type WizardAuthoringPort,
} from "@stateful-mcp/macro/workspace/config/wizard";
import type {
	ValueAuthoringProfileDto,
	ValueAuthoringResult,
	ValueCatalogDto,
} from "@stateful-mcp/macro-protocol";
import { renderToString } from "react-dom/server";
import { ValueStudio } from "../src/components/value-authoring/ValueStudio";
import { I18nProvider } from "../src/lib/macro-i18n-provider";
import { valueStudioDirtyRegistry } from "../src/state/value-authoring/dirty-registry";
import { createHostClientAuthoringPort } from "../src/state/value-authoring/host-client-port";
import { isValueAuthoredSection } from "../src/state/value-authoring/section-filter";

const CATALOG: ValueCatalogDto = {
	valueKinds: ["date-time"],
	terminalIds: ["text", "number"],
	recipes: [
		{
			id: "date.date.iso",
			valueKind: "date-time",
			providedFields: ["year", "month", "day"],
		},
	],
};

function profile(id: string): ValueAuthoringProfileDto {
	return {
		id,
		aliases: [],
		fundamentals: [],
		recipes: [],
		values: {
			dateTime: {
				formats: {
					"date.iso": { id: "date.iso", kind: "date", source: "YYYY-MM-DD" },
				},
				display: { date: "date.iso" },
				parse: { date: ["date.iso"], time: [], datetime: [] },
			},
		},
	} as unknown as ValueAuthoringProfileDto;
}

function fixturePort(): WizardAuthoringPort & { calls: unknown[] } {
	const calls: unknown[] = [];
	const { port } = createFixtureAuthoringPort({
		profiles: { base: profile("base") },
		revisions: { base: "rev-01" },
		catalog: CATALOG,
	});
	return new Proxy(port as WizardAuthoringPort & { calls: unknown[] }, {});
}

describe("host client authoring port adapter", () => {
	test("maps the four typed operations onto the wizard port", async () => {
		const recorded: string[] = [];
		const result: ValueAuthoringResult = {
			status: "validated",
			validation: { valid: true, diagnostics: [], graphFingerprint: "f" },
		};
		const client = {
			valueAuthoringLoad: async (id: string) => {
				recorded.push(`load:${id}`);
				return {
					status: "conflict",
					code: "SETTINGS_REVISION_STALE",
					messageKey: "x",
				} as never;
			},
			valueAuthoringValidate: async () => {
				recorded.push("validate");
				return result;
			},
			valueAuthoringPreview: async (
				_p: unknown,
				options?: Record<string, unknown>,
			) => {
				recorded.push(`preview:${JSON.stringify(options)}`);
				return result;
			},
			valueAuthoringSave: async (p: unknown, revision: string) => {
				recorded.push(`save:${revision}:${Object.keys(p as object).length}`);
				return result;
			},
		};
		const port = createHostClientAuthoringPort(client as never);
		await port.load("wizard-date");
		const profileDto = profile("wizard-date");
		await port.validate(profileDto);
		await port.preview(profileDto, {
			samples: [{ input: "2026-08-26" }],
			request: { valueKind: "date-time", requiredFields: ["year"] },
			expectedRevision: "rev-1",
		});
		await port.save(profileDto, "rev-2");
		expect(recorded[0]).toBe("load:wizard-date");
		expect(recorded[1]).toBe("validate");
		expect(recorded[2]).toContain('"valueKind":"date-time"');
		expect(recorded[2]).toContain('"expectedRevision":"rev-1"');
		expect(recorded[3]).toStartWith("save:rev-2:");
	});

	test("preview options are omitted when not supplied", async () => {
		let seenOptions: unknown = "unset";
		const client = {
			valueAuthoringLoad: async () => ({}) as never,
			valueAuthoringValidate: async () => ({}) as never,
			valueAuthoringPreview: async (_p: unknown, o?: unknown) => {
				seenOptions = o;
				return {} as never;
			},
			valueAuthoringSave: async () => ({}) as never,
		};
		const port = createHostClientAuthoringPort(client as never);
		await port.preview(profile("x"));
		expect(seenOptions).toMatchObject({
			samples: undefined,
			request: undefined,
			expectedRevision: undefined,
		});
	});
});

describe("dirty registry bridge", () => {
	test("publishes and reverts dirty state to subscribers", () => {
		let observed = valueStudioDirtyRegistry.get();
		const unsubscribe = valueStudioDirtyRegistry.subscribe(() => {
			observed = valueStudioDirtyRegistry.get();
		});
		valueStudioDirtyRegistry.set(true);
		expect(observed).toBe(true);
		valueStudioDirtyRegistry.set(false);
		expect(observed).toBe(false);
		unsubscribe();
	});
});

describe("value section ownership filter", () => {
	test("identifies legacy value/syntax categories", () => {
		expect(isValueAuthoredSection("settings.category.values")).toBe(true);
		expect(isValueAuthoredSection("settings.category.syntax")).toBe(true);
		expect(isValueAuthoredSection("values")).toBe(true);
		expect(isValueAuthoredSection("settings.category.appearance")).toBe(false);
		expect(isValueAuthoredSection("settings.category.editor")).toBe(false);
	});
});

describe("Value Studio first slice integration", () => {
	test("loading state renders before the model is ready", () => {
		const store = createValueAuthoringWizard(fixturePort());
		const html = renderToString(
			<I18nProvider>
				<ValueStudio store={store} />
			</I18nProvider>,
		);
		expect(html).toContain("value-studio");
		store.dispose();
	});

	test("drives the five-step flow against a fixture transport", async () => {
		const store = createValueAuthoringWizard(fixturePort(), {
			activeProfileId: "base",
			schedule: immediateSchedule,
			debounceMs: 0,
		});
		const loaded = await store.actions.startEdit("base");
		expect(loaded).toBe(true);

		let state = store.getState();
		expect(state.ready).toBe(true);
		expect(state.catalog?.valueKinds).toEqual(["date-time"]);
		expect(state.baselineRevision).toBe("rev-01");

		for (const step of [
			"numerics-lexicon",
			"base-templates",
			"combinators",
			"sandbox",
		] as const) {
			expect(store.actions.goToStep(step)).toBe(true);
		}
		state = store.getState();
		expect(state.step).toBe("sandbox");

		store.actions.setSandboxSamples([{ input: "2026-08-26" }]);
		store.actions.setSandboxRequest({ valueKind: "date-time" });
		const ran = await store.actions.runSandbox();
		expect(ran).toBe(true);
		await new Promise((resolve) => setTimeout(resolve, 0));
		state = store.getState();
		expect(state.preview.results.length).toBe(1);

		store.actions.goToStep("numerics-lexicon");
		expect(store.actions.setNumericOption("decimalSeparator", ".")).toBe(true);
		expect(store.getState().dirty).toBe(true);
		await new Promise((resolve) => setTimeout(resolve, 5));
		state = store.getState();
		expect(state.validation.status).toBe("settled");
		expect(state.validation.valid).toBe(true);

		const saved = await store.actions.save();
		expect(saved).toBe(true);
		expect(store.getState().saveState.kind).toBe("saved");
		expect(store.getState().dirty).toBe(false);
		store.dispose();
	});

	test("stale preview responses never replace newer results", async () => {
		const { port } = createFixtureAuthoringPort({
			profiles: { base: profile("base") },
			revisions: { base: "rev-01" },
			catalog: CATALOG,
			previewImpl: async (_hooks, incomingProfile, options) => ({
				status: "previewed",
				settingsRevision: "rev-01",
				draft: {
					profile: incomingProfile,
					dirty: false,
					diagnostics: [],
					compileStatus: "valid" as const,
					graphFingerprint: options?.samples?.[0]?.input ?? "",
					revision: "rev-01",
				},
				preview: {
					graphFingerprint: options?.samples?.[0]?.input ?? "",
					samples: [
						{
							input: options?.samples?.[0]?.input ?? "",
							matched: true,
							recipeId: `recipe-${options?.samples?.[0]?.input ?? ""}`,
							diagnostics: [],
						},
					],
				},
			}),
		});
		const store = createValueAuthoringWizard(port, {
			activeProfileId: "base",
			schedule: immediateSchedule,
			debounceMs: 0,
		});
		await store.actions.startEdit("base");
		store.actions.goToStep("sandbox");
		// First (older) request settles first; the newer request supersedes it.
		store.actions.setSandboxSamples([{ input: "first" }]);
		await store.actions.runSandbox();
		await new Promise((resolve) => setTimeout(resolve, 0));
		store.actions.setSandboxSamples([{ input: "second" }]);
		await store.actions.runSandbox();
		await new Promise((resolve) => setTimeout(resolve, 0));
		const state = store.getState();
		expect(state.preview.results[0]?.input).toBe("second");
		store.dispose();
	});

	test("stale save conflict preserves the draft and recovers on acknowledge", async () => {
		const { port, revisions } = createFixtureAuthoringPort({
			profiles: { base: profile("base") },
			revisions: { base: "rev-01" },
			catalog: CATALOG,
		});
		const store = createValueAuthoringWizard(port, {
			activeProfileId: "base",
			schedule: immediateSchedule,
			debounceMs: 0,
		});
		await store.actions.startEdit("base");
		// Simulate an external revision bump behind the wizard's back.
		revisions.base = "rev-09";
		store.actions.goToStep("numerics-lexicon");
		store.actions.setNumericOption("decimalSeparator", ".");
		await new Promise((resolve) => setTimeout(resolve, 5));
		const saved = await store.actions.save();
		expect(saved).toBe(false);
		let state = store.getState();
		expect(state.conflict).not.toBeNull();
		expect(state.conflict?.actualRevision).toBe("rev-09");
		expect(state.dirty).toBe(true);
		expect(state.localProfile?.values).toBeDefined();

		revisions.base = "rev-10";
		await store.actions.acknowledgeConflict();
		state = store.getState();
		expect(state.conflict).toBeNull();
		expect(state.baselineRevision).toBe("rev-10");
		store.dispose();
	});

	test("guard denies combinator access without a resolved profile", async () => {
		const store = createValueAuthoringWizard(fixturePort());
		expect(store.actions.goToStep("combinators")).toBe(false);
		const denial = store
			.getState()
			.guardDenials.find((item) => item.to === "combinators");
		expect(denial).toBeDefined();
		store.dispose();
	});

	test("ready studio renders header, rail and current step markup", async () => {
		const store = createValueAuthoringWizard(fixturePort(), {
			activeProfileId: "other",
		});
		await store.actions.startEdit("base");
		const html = renderToString(
			<I18nProvider>
				<ValueStudio store={store} />
			</I18nProvider>,
		);
		expect(html).toContain("vs-header");
		expect(html).toContain("vs-rail");
		expect(html).toContain("vs-canvas");
		store.dispose();
	});
});
