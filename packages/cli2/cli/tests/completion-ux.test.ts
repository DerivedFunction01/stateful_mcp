import { describe, expect, test } from "bun:test";
import type { AutocompleteSuggestion } from "@stateful-mcp/clinical/notebook/command-autocomplete";
import { getAutocompleteSuggestions } from "@stateful-mcp/clinical/notebook/command-autocomplete";
import type { CommandDescriptor } from "@stateful-mcp/clinical/session/command-descriptor";
import { CommandGroup } from "@stateful-mcp/clinical/session/command-descriptor";
import { capSuggestions, MAX_ARG, MAX_VERB } from "../src/lib/editor/palette";
import { t } from "../src/lib/shared/i18n";

function verbSug(verb: string, group = "editor"): AutocompleteSuggestion {
	return {
		verb,
		group,
		source: "editor",
		hasArgs: false,
		kind: "verb",
		descriptionKey: `command.description.${verb}`,
	};
}

function argSug(
	verb: string,
	group: string,
	argIndex = 0,
	argName = "arg",
): AutocompleteSuggestion {
	return {
		verb,
		group,
		source: "editor",
		hasArgs: false,
		kind: "arg",
		argIndex,
		argName,
	};
}

const desc = (
	verb: string,
	group: CommandGroup,
	args: string[] = [],
	dk?: string,
): CommandDescriptor => ({
	verb,
	aliases: [],
	group,
	descriptionKey: dk ?? `command.description.${verb}`,
	args: args.map((name) => ({
		name,
		required: true,
		descriptionKey: `arg.${verb}.${name}`,
	})),
});

describe("getAutocompleteSuggestions — type tagging", () => {
	test("verb suggestions carry kind='verb' and descriptionKey", () => {
		const res = getAutocompleteSuggestions(
			"def",
			[desc("default", CommandGroup.Editor, ["section"])],
			[],
		);
		expect(res).toHaveLength(1);
		expect(res[0]!.kind).toBe("verb");
		expect(res[0]!.descriptionKey).toBe("command.description.default");
		expect(res[0]!.argNames).toEqual(["section"]);
	});
});

describe("capSuggestions", () => {
	const verbs = Array.from({ length: 12 }, (_, i) => verbSug(`v${i}`));
	const args = Array.from({ length: 8 }, (_, i) => argSug(`a${i}`, "section"));

	test("wide terminal keeps verb and arg budgets", () => {
		const all = [...verbs, ...args];
		const { visible, hidden } = capSuggestions(120, all, 0);
		expect(visible.length).toBe(MAX_VERB + MAX_ARG);
		expect(hidden).toBe(all.length - visible.length);
	});

	test("keeps the active candidate visible even when beyond budget", () => {
		const { visible, hidden } = capSuggestions(120, args, 6);
		expect(visible).toContain(args[6]);
		expect(hidden).toBe(args.length - visible.length);
	});

	test("very narrow terminal collapses to active candidate + count", () => {
		const { visible, hidden } = capSuggestions(30, verbs, 3);
		expect(visible).toEqual([verbs[3]]);
		expect(hidden).toBe(verbs.length - 1);
	});

	test("empty suggestions yield empty", () => {
		expect(capSuggestions(120, [], 0)).toEqual({ visible: [], hidden: 0 });
	});
});

describe("i18n description resolution", () => {
	test("existing keys resolve; unknown keys fall back to the key", () => {
		expect(t("description.not.a.real.key")).toBe("description.not.a.real.key");
	});
	test("editor and cell command descriptions are present", () => {
		expect(t("editor.command.w")).toBeTruthy();
		expect(t("command.description.run")).toBeTruthy();
		expect(t("arg.default.section")).toBeTruthy();
	});
});

describe("autocomplete suggestions with aliases and deduplication", () => {
	const defaultDesc: CommandDescriptor = {
		verb: "default",
		aliases: ["set-default", "set-default-insert"],
		group: CommandGroup.Editor,
		descriptionKey: "command.description.default",
		args: [],
	};

	test("matches and returns canonical name when prefix matches alias or canonical verb", () => {
		const suggestions = getAutocompleteSuggestions(
			"set-def",
			[defaultDesc],
			[],
		);
		expect(suggestions).toHaveLength(1);
		expect(suggestions[0]!.verb).toBe("default");
	});

	test("returns canonical name if prefix matches canonical name", () => {
		const suggestions = getAutocompleteSuggestions("def", [defaultDesc], []);
		expect(suggestions).toHaveLength(1);
		expect(suggestions[0]!.verb).toBe("default");
	});

	test("deduplicates suggestions so only one candidate per descriptor is returned", () => {
		const suggestions = getAutocompleteSuggestions(
			"set-default",
			[defaultDesc],
			[],
		);
		expect(suggestions).toHaveLength(1);
		expect(suggestions[0]!.verb).toBe("default");
	});
});
