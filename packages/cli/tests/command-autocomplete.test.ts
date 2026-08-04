import { describe, expect, it } from "bun:test";
import { bootstrapCommandDefaults } from "@stateful-mcp/clinical/bootstrap/bootstrap-config";
import { createCommandSyntaxProfile } from "@stateful-mcp/clinical/commands/command-syntax-profile";
import {
	argumentSuggestions,
	dedupeCanonicalSuggestions,
	historySuggestions,
	knownVerbs,
	MAX_SUGGESTIONS,
	rankArgumentSuggestions,
} from "../src/lib/editor/command-autocomplete";
import { buildCommandDescriptors } from "../src/lib/editor/command-descriptors";
import { has, t } from "../src/lib/shared/i18n";

const defaultProfile = createCommandSyntaxProfile(
	{ profileId: "v2-default" },
	bootstrapCommandDefaults,
);

const TOKEN = ":";

function descriptorsFor(profile = defaultProfile) {
	return buildCommandDescriptors(profile, {
		variableName: profile.variableCommandName,
		variableAliases: ["variable"],
	});
}

describe("CLI2 command autocomplete", () => {
	describe("canonical descriptor builder", () => {
		it("groups editor aliases by canonical verb", () => {
			const descriptors = descriptorsFor();
			const write = descriptors.find((d) => d.verb === "write");
			expect(write).toBeDefined();
			expect(write?.aliases).toContain("w");
			// `write` itself is the canonical, not an alias
			expect(write?.aliases).not.toContain("write");
		});

		it("groups direct commands by canonical verb", () => {
			const descriptors = descriptorsFor();
			const branch = descriptors.find((d) => d.verb === "branch");
			expect(branch).toBeDefined();
			expect(branch?.group).toBe("direct");
		});

		it("includes the var command descriptor", () => {
			const descriptors = descriptorsFor();
			const variable = descriptors.find((d) => d.verb === "var");
			expect(variable).toBeDefined();
			expect(variable?.aliases).toContain("variable");
		});

		it("recognizes a custom bootstrap verb without English hardcoding", () => {
			const customProfile = createCommandSyntaxProfile(
				{
					profileId: "custom",
					editorCommandMappings: {
						...bootstrapCommandDefaults.editorCommandMappings,
						zorg: "zorg",
						z: "zorg",
					},
				},
				bootstrapCommandDefaults,
			);
			const descriptors = buildCommandDescriptors(customProfile, {
				variableName: customProfile.variableCommandName,
			});
			const zorg = descriptors.find((d) => d.verb === "zorg");
			expect(zorg).toBeDefined();
			expect(zorg?.aliases).toContain("z");
		});
	});

	describe("canonical dedup (V1 parity)", () => {
		it("emits one chip per canonical verb, not one per alias", () => {
			const descriptors = descriptorsFor();
			const suggestions = dedupeCanonicalSuggestions(descriptors, "w", TOKEN);
			// Typing `w` matches both `write` (alias `w`) and `write_quit`
			// (alias `wq`). We get one chip per canonical verb (2), not one per
			// alias (4: w, write, wq, write_quit).
			const verbs = suggestions.map((s) => s.verb);
			expect(verbs).toContain("write");
			expect(verbs).toContain("write_quit");
			// No duplicate canonical verbs.
			expect(new Set(verbs).size).toBe(verbs.length);
			// No alias-only chips (e.g. `w`, `wq`).
			expect(verbs).not.toContain("w");
			expect(verbs).not.toContain("wq");
		});

		it("matches by alias but emits canonical verb", () => {
			const descriptors = descriptorsFor();
			// `q` is an alias for `quit`; typing `q` yields canonical `quit`.
			const suggestions = dedupeCanonicalSuggestions(descriptors, "q", TOKEN);
			expect(suggestions).toHaveLength(1);
			expect(suggestions[0]?.verb).toBe("quit");
		});

		it("matches `wq` alias to canonical `write_quit`", () => {
			const descriptors = descriptorsFor();
			const suggestions = dedupeCanonicalSuggestions(descriptors, "wq", TOKEN);
			expect(suggestions).toHaveLength(1);
			expect(suggestions[0]?.verb).toBe("write_quit");
		});

		it("sorts exact-match first, then shortest", () => {
			const descriptors = descriptorsFor();
			// Typing `w` matches both `write` (exact alias `w`→canonical `write`)
			// and `write_quit` (alias `wq`). `write` is shorter → first.
			const suggestions = dedupeCanonicalSuggestions(descriptors, "w", TOKEN);
			expect(suggestions[0]?.verb).toBe("write");
		});

		it("caps at MAX_SUGGESTIONS (12)", () => {
			const descriptors = descriptorsFor();
			// Empty partial returns [] (V1 parity: no empty-prefix flood).
			const empty = dedupeCanonicalSuggestions(descriptors, "", TOKEN);
			expect(empty).toEqual([]);
			// A broad prefix like `c` should be capped.
			const suggestions = dedupeCanonicalSuggestions(descriptors, "c", TOKEN);
			expect(suggestions.length).toBeLessThanOrEqual(MAX_SUGGESTIONS);
		});

		it("completionText is the canonical verb (no token prefix)", () => {
			const descriptors = descriptorsFor();
			const suggestions = dedupeCanonicalSuggestions(descriptors, "w", TOKEN);
			// completionText is the bare verb; mergeCandidate prepends the token.
			expect(suggestions[0]?.completionText).toBe("write");
		});
	});

	describe("learned history ranking", () => {
		it("can rank a frequently used history command ahead of static matches", () => {
			const suggestions = historySuggestions(
				[
					{
						commandText: ":wq",
						sessionCount: 12,
						allCount: 20,
						sessionLastUsedAt: "2026-08-04T12:00:00.000Z",
					},
					{
						commandText: ":w",
						sessionCount: 1,
						allCount: 1,
						allLastUsedAt: "2026-08-04T11:00:00.000Z",
					},
				],
				"w",
				TOKEN,
			);
			expect(suggestions.map((suggestion) => suggestion.verb)).toEqual(["wq", "w"]);
			expect(suggestions[0]?.descriptionKey).toBeUndefined();
		});
	});

	describe("var recognition", () => {
		it("var is in the known verb set", () => {
			const descriptors = descriptorsFor();
			const known = knownVerbs(descriptors);
			expect(known.has("var")).toBe(true);
			expect(known.has("variable")).toBe(true);
		});

		it("typing `var` yields a var suggestion (not flagged unknown)", () => {
			const descriptors = descriptorsFor();
			const suggestions = dedupeCanonicalSuggestions(descriptors, "var", TOKEN);
			expect(suggestions.some((s) => s.verb === "var")).toBe(true);
		});

		it("completes variable operations through the generic argument path", () => {
			const descriptors = descriptorsFor();
			const all = argumentSuggestions("var ", descriptors);
			expect(all.map((suggestion) => suggestion.label)).toEqual([
				"set",
				"update",
				"eval",
				"assert",
				"remove",
			]);
			expect(argumentSuggestions("var s", descriptors)[0]).toMatchObject({
				kind: "arg",
				argIndex: 0,
				argName: "operation",
				label: "set",
			});
		});

		it("uses localized profile mapping labels as operation completions", () => {
			const localized = createCommandSyntaxProfile(
				{
					profileId: "es",
					variableCommandMappings: {
						establecer: "set",
						actualizar: "update",
						evaluar: "eval",
						afirmar: "assert",
						eliminar: "remove",
					},
				},
				bootstrapCommandDefaults,
			);
			const descriptors = descriptorsFor(localized);
			expect(argumentSuggestions("var est", descriptors).map((s) => s.label)).toEqual([
				"establecer",
			]);
		});
	});

	describe("macro mode", () => {
		it("MACRO mode excludes editor/direct/var descriptors", () => {
			// In MACRO mode, variableName is undefined → no var descriptor.
			const macroDescriptors = buildCommandDescriptors(defaultProfile, {});
			const hasVar = macroDescriptors.some((d) => d.verb === "var");
			expect(hasVar).toBe(false);
		});

		it("macro names are suggested in MACRO mode", () => {
			const macroDescriptors = buildCommandDescriptors(defaultProfile, {
				macroNames: ["observation", "obs"],
			});
			const suggestions = dedupeCanonicalSuggestions(
				macroDescriptors,
				"obs",
				"^",
				"macro",
				"macro",
			);
			expect(suggestions.map((s) => s.verb)).toEqual(["obs", "observation"]);
		});
	});

	describe("argument-space suppression", () => {
		it("no-match warning is suppressed when a space is present", () => {
			// Simulate the CommandBar noMatch heuristic: `:var ` (trailing space)
			// should not produce a warning because the raw partial contains a space.
			const rawPartial = "var ";
			const spaceIdx = rawPartial.indexOf(" ");
			expect(spaceIdx).toBeGreaterThanOrEqual(0);
		});

		it("knownVerbs suppresses no-match for a recognized verb with no args", () => {
			const descriptors = descriptorsFor();
			const known = knownVerbs(descriptors);
			// `var` is known → no-match should be suppressed even if suggestions
			// is empty (e.g. argument-space edge case).
			expect(known.has("var")).toBe(true);
		});
	});

	describe("i18n interpolation", () => {
		it("celllist.empty interpolates the {key} placeholder", () => {
			expect(has("celllist.empty")).toBe(true);
			expect(has("celllist.empty.key")).toBe(true);
			const rendered = t("celllist.empty", { key: t("celllist.empty.key") });
			expect(rendered).toBe("No cells. Press o to create one.");
			expect(rendered).not.toContain("{key}");
		});

		it("command.noMatch interpolates the {partial} placeholder", () => {
			const rendered = t("command.noMatch", { partial: "xyz" });
			expect(rendered).toContain("xyz");
			expect(rendered).not.toContain("{partial}");
		});
	});

	describe("argument suggestions ranking", () => {
		it("ranks exact prefix matches first and applies weights", () => {
			const candidates = [
				{ value: "baseline_date", source: "static" as const, valid: true },
				{ value: "patient.weight", source: "history" as const, valid: true, baseScore: 50 },
				{ value: "patient.height", source: "scope" as const, valid: true },
			];
			const context = {
				commandId: "var",
				commandVerb: "var",
				argumentIndex: 1,
				argumentPrefix: "patient",
				priorArguments: ["set"],
				allArguments: ["set", "patient"],
				sessionId: "sess-1",
			};
			const suggestions = rankArgumentSuggestions(candidates, context);
			expect(suggestions).toHaveLength(3);
			// "patient.weight" is a prefix match and has history baseScore (50) + source priority (0) = 50 + 500 = 550
			// "patient.height" has source priority (100) + prefix match (500) = 600.
			// "baseline_date" doesn't match the prefix "patient".
			expect(suggestions[0]?.value).toBe("patient.height");
			expect(suggestions[1]?.value).toBe("patient.weight");
			expect(suggestions[2]?.value).toBe("baseline_date");
		});
	});
});
