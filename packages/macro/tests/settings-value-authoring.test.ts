import { describe, expect, test } from "bun:test";
import { serializeValueAuthoringDraft } from "../src/workspace/config/settings-projection";
import { WorkspaceSettingsService } from "../src/workspace/config/settings-service";
import { SettingsUiModel } from "../src/workspace/config/settings-ui-model";
import {
	authoredValueGraphFingerprint,
	compileValueAuthoringPolicies,
	compileValueAuthoringProfile,
	createValueAuthoringDraft,
	deserializeValueAuthoringProfile,
	roundTripValueAuthoringProfile,
	serializeValueAuthoringProfile,
	toAuthoredValueGraph,
	type ValueAuthoringProfile,
} from "../src/workspace/config/value-authoring";

describe("value authoring settings foundation", () => {
	const profile: ValueAuthoringProfile = {
		id: "default",
		aliases: [
			{
				id: "meters",
				namespace: "literal",
				spellings: ["m"],
				target: { kind: "canonical", value: "meter" },
			},
		],
		fundamentals: [],
		recipes: [
			{
				id: "text",
				root: { kind: "terminal", consumerId: "text" },
			},
		],
		argumentPolicies: {
			title: { enabledRecipes: ["text"] },
		},
	};

	test("round-trips authored graph data without changing contract shape", () => {
		const encoded = serializeValueAuthoringProfile(profile);
		expect(deserializeValueAuthoringProfile(encoded)).toEqual(profile);
		expect(roundTripValueAuthoringProfile(profile)).toEqual(profile);
	});

	test("preserves typed recipe references and resolver references", () => {
		const authored: ValueAuthoringProfile = {
			...profile,
			aliases: [
				{
					id: "today",
					namespace: "resolver",
					spellings: ["today"],
					target: {
						kind: "resolver",
						resolverId: "clock.today",
						params: { zone: "UTC" },
					},
				},
			],
			fundamentals: [
				{
					id: "wrapped",
					variants: [
						{ id: "plain", slots: [{ id: "value", parserId: "text" }] },
					],
				},
			],
			recipes: [
				...(profile.recipes ?? []),
				{ id: "wrapped-recipe", root: { kind: "recipe", recipeId: "text" } },
			],
			aliasResolvers: {
				"clock.today": () => ({ value: "2026-08-26" }),
			},
		};
		const encoded = serializeValueAuthoringProfile(authored);
		const restored = deserializeValueAuthoringProfile(encoded);
		expect(restored.aliases).toEqual(authored.aliases);
		expect(restored.recipes).toEqual(authored.recipes);
		expect(restored.aliasResolvers).toBeUndefined();
		expect(compileValueAuthoringProfile(authored).valid).toBe(true);
	});

	test("projects a typed draft through the service and UI model", () => {
		const service = new WorkspaceSettingsService({ defaults: {} });
		const model = new SettingsUiModel(service);
		const draft = model.getValueAuthoringDraft(profile, {
			activeDomain: "values",
			selectedGroupId: "wrapped",
			selectedRecipeId: "text",
			revision: "r1",
			dirty: true,
		});
		const projected = serializeValueAuthoringDraft(draft);
		expect(projected.profile).toEqual(serializeValueAuthoringProfile(profile));
		expect(projected.selectedRecipeId).toBe("text");
		expect(projected.graphFingerprint).toBe(draft.graphFingerprint);
		expect(service.getAuthoredValueGraph(profile)).toEqual(
			toAuthoredValueGraph(profile),
		);
	});

	test("compiles argument policies against authored recipe IDs", () => {
		const compiled = compileValueAuthoringPolicies(profile);
		expect(compiled.diagnostics).toEqual([]);
		expect(compiled.policies.title?.enabledRecipes).toEqual(["text"]);
		const invalid = compileValueAuthoringProfile({
			...profile,
			argumentPolicies: { title: { enabledRecipes: ["missing"] } },
		});
		expect(invalid.valid).toBe(false);
		expect(invalid.diagnostics[0]).toMatchObject({
			code: "UNKNOWN_ENABLED_RECIPE",
		});
	});

	test("fingerprints graph semantics deterministically", () => {
		const first = authoredValueGraphFingerprint({
			aliases: profile.aliases,
			fundamentals: profile.fundamentals,
			recipes: profile.recipes,
			values: { numeric: { decimalSeparator: "." } },
		});
		const second = authoredValueGraphFingerprint({
			values: { numeric: { decimalSeparator: "." } },
			recipes: profile.recipes,
			fundamentals: profile.fundamentals,
			aliases: profile.aliases,
		});
		expect(second).toBe(first);
	});

	test("reports an empty draft without inventing runtime grammar", () => {
		const draft = createValueAuthoringDraft({
			id: "empty",
			aliases: [],
			fundamentals: [],
			recipes: [],
			argumentPolicies: {},
		});
		expect(draft.compileStatus).toBe("empty");
		expect(draft.diagnostics).toEqual([]);
	});

	test("rejects malformed persisted profiles", () => {
		expect(() => deserializeValueAuthoringProfile({ id: "broken" })).toThrow(
			/aliases must be an array/,
		);
		expect(() =>
			deserializeValueAuthoringProfile({
				...profile,
				aliases: [
					{
						id: "bad",
						namespace: "literal",
						spellings: ["bad"],
						target: { kind: "resolver", resolverId: 42 },
					},
				],
			}),
		).toThrow(/aliases\[0\]/);
	});

	test("retains compiler diagnostic codes and authored paths", () => {
		const invalid = compileValueAuthoringProfile({
			...profile,
			fundamentals: [
				{
					id: "broken",
					variants: [
						{ id: "plain", slots: [], prefix: [{ id: "p", text: "(" }] },
					],
				},
			],
			recipes: [
				{
					id: "broken-recipe",
					root: { kind: "fundamental", groupId: "missing", children: [] },
				},
			],
		});
		expect(invalid.valid).toBe(false);
		expect(
			invalid.diagnostics.some((d) => d.code === "UNKNOWN_FUNDAMENTAL_GROUP"),
		).toBe(true);
		expect(invalid.diagnostics.some((d) => d.path?.[0] === "recipes")).toBe(
			true,
		);
	});
});
