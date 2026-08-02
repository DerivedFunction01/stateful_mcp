import { describe, expect, test } from "bun:test";
import type { AutocompleteSuggestion } from "@stateful-mcp/clinical/notebook/command-autocomplete";
import {
	type CompletionState,
	completionRemainder,
	cycleIndex,
	deriveCompletionSession,
	mergeCandidate,
	reduceCompletion,
} from "../src/lib/editor/completion-state";

function sug(
	verb: string,
	source: "editor" | "cell" = "editor",
): AutocompleteSuggestion {
	return { verb, group: "test", source, hasArgs: false, kind: "verb" };
}

function setSuggestions(verbs: string[]) {
	return () => verbs.map((v) => sug(v));
}

describe("cycleIndex", () => {
	test("wraps forward", () => {
		expect(cycleIndex(0, 3, 1)).toBe(1);
		expect(cycleIndex(2, 3, 1)).toBe(0);
	});
	test("wraps backward", () => {
		expect(cycleIndex(0, 3, -1)).toBe(2);
		expect(cycleIndex(2, 3, -1)).toBe(1);
	});
	test("handles empty/zero guards", () => {
		expect(cycleIndex(0, 0, 1)).toBe(-1);
		expect(cycleIndex(0, -1, 1)).toBe(-1);
	});
});

describe("mergeCandidate", () => {
	test("verb path without trailing space", () => {
		expect(mergeCandidate(":d", "delete", false)).toBe(":delete");
	});
	test("verb path with trailing space", () => {
		expect(mergeCandidate(":d", "delete", true)).toBe(":delete ");
	});
	test("arg path keeps verb and prior args", () => {
		expect(mergeCandidate(":insert hpi", "history", false)).toBe(
			":insert history",
		);
	});
	test("arg path with trailing space", () => {
		expect(mergeCandidate(":insert hpi", "history", true)).toBe(
			":insert history ",
		);
	});
	test("arg path with prior args preserves them", () => {
		expect(mergeCandidate(":insert soap sub", "subjective", true)).toBe(
			":insert soap subjective ",
		);
	});
});

describe("deriveCompletionSession", () => {
	test("verb mode", () => {
		const s = deriveCompletionSession(":d");
		expect(s).not.toBeNull();
		expect(s!.mode).toBe("verb");
		expect(s!.prefix).toBe("d");
		expect(s!.commandLineSnapshot).toBe(":d");
	});
	test("arg mode", () => {
		const s = deriveCompletionSession(":insert sub");
		expect(s).not.toBeNull();
		expect(s!.mode).toBe("arg");
		expect(s!.verb).toBe("insert");
		expect(s!.argIndex).toBe(0);
		expect(s!.prefix).toBe("sub");
	});
	test("arg mode with multiple args", () => {
		const s = deriveCompletionSession(":insert soap sub");
		expect(s).not.toBeNull();
		expect(s!.mode).toBe("arg");
		expect(s!.verb).toBe("insert");
		expect(s!.argIndex).toBe(1);
		expect(s!.prefix).toBe("sub");
	});
	test("null for empty partial", () => {
		expect(deriveCompletionSession(":")).toBeNull();
	});
});

describe("completionRemainder", () => {
	test("returns rest after prefix", () => {
		expect(completionRemainder("delete", "d")).toBe("elete");
	});
	test("returns rest for longer prefix", () => {
		expect(completionRemainder("subjective", "sub")).toBe("jective");
	});
	test("empty when candidate does not start with prefix", () => {
		expect(completionRemainder("delete", "x")).toBe("");
	});
});

describe("reduceCompletion", () => {
	const idle: CompletionState = { status: "idle" };

	test("Tab from idle enters cycling with first candidate", () => {
		const r = reduceCompletion(
			idle,
			{ kind: "tab", shift: false },
			":d",
			setSuggestions(["delete", "down", "dd"]),
		);
		expect(r.completionState.status).toBe("cycling");
		if (r.completionState.status === "cycling") {
			expect(r.completionState.highlightIndex).toBe(0);
			expect(r.completionState.candidates[0]!.verb).toBe("delete");
			expect(r.completionState.session.prefix).toBe("d");
		}
	});

	test("Tab advances through candidates", () => {
		const first = reduceCompletion(
			idle,
			{ kind: "tab", shift: false },
			":d",
			setSuggestions(["delete", "down", "dd"]),
		).completionState as CompletionState & { status: "cycling" };
		const second = reduceCompletion(
			first,
			{ kind: "tab", shift: false },
			":d",
			setSuggestions(["delete", "down", "dd"]),
		);
		expect(second.completionState.status).toBe("cycling");
		if (second.completionState.status === "cycling") {
			expect(second.completionState.highlightIndex).toBe(1);
			expect(second.completionState.candidates[1]!.verb).toBe("down");
		}
	});

	test("Tab wraps at end", () => {
		const first = reduceCompletion(
			idle,
			{ kind: "tab", shift: false },
			":d",
			setSuggestions(["delete", "down"]),
		).completionState as CompletionState & { status: "cycling" };
		const second = reduceCompletion(
			first,
			{ kind: "tab", shift: false },
			":d",
			setSuggestions(["delete", "down"]),
		).completionState as CompletionState & { status: "cycling" };
		// second has highlight 1 (last candidate); next wraps to 0
		expect(second.highlightIndex).toBe(1);
		const wrapped = reduceCompletion(
			second,
			{ kind: "tab", shift: false },
			":d",
			setSuggestions(["delete", "down"]),
		);
		expect(wrapped.completionState.status).toBe("cycling");
		if (wrapped.completionState.status === "cycling") {
			expect(wrapped.completionState.highlightIndex).toBe(0);
		}
	});

	test("Shift-Tab retreats", () => {
		const first = reduceCompletion(
			idle,
			{ kind: "tab", shift: false },
			":d",
			setSuggestions(["delete", "down", "dd"]),
		).completionState as CompletionState & { status: "cycling" };
		const r = reduceCompletion(
			first,
			{ kind: "tab", shift: true },
			":d",
			setSuggestions(["delete", "down", "dd"]),
		);
		expect(r.completionState.status).toBe("cycling");
		if (r.completionState.status === "cycling") {
			expect(r.completionState.highlightIndex).toBe(2);
		}
	});

	test("up/down cycle when cycling", () => {
		const cycling = reduceCompletion(
			idle,
			{ kind: "tab", shift: false },
			":d",
			setSuggestions(["delete", "down", "dd"]),
		).completionState as CompletionState & { status: "cycling" };
		const up = reduceCompletion(
			cycling,
			{ kind: "up" },
			":d",
			setSuggestions([]),
		);
		if (up.completionState.status === "cycling") {
			expect(up.completionState.highlightIndex).toBe(2);
		}
		const down = reduceCompletion(
			cycling,
			{ kind: "down" },
			":d",
			setSuggestions([]),
		);
		if (down.completionState.status === "cycling") {
			expect(down.completionState.highlightIndex).toBe(1);
		}
	});

	test("up/down navigate history when idle", () => {
		const r = reduceCompletion(idle, { kind: "up" }, ":", setSuggestions([]));
		expect(r.completionState.status).toBe("idle");
		expect(r.historyMove).toBe("prev");
		const r2 = reduceCompletion(
			idle,
			{ kind: "down" },
			":",
			setSuggestions([]),
		);
		expect(r2.historyMove).toBe("next");
	});

	test("char resets to idle and appends", () => {
		const cycling = reduceCompletion(
			idle,
			{ kind: "tab", shift: false },
			":d",
			setSuggestions(["delete", "down"]),
		).completionState;
		const r = reduceCompletion(
			cycling,
			{ kind: "char", char: "e" },
			":d",
			setSuggestions([]),
		);
		expect(r.completionState.status).toBe("idle");
		expect(r.shouldAppend).toBe("e");
	});

	test("backspace resets to idle", () => {
		const cycling = reduceCompletion(
			idle,
			{ kind: "tab", shift: false },
			":d",
			setSuggestions(["delete", "down"]),
		).completionState;
		const r = reduceCompletion(
			cycling,
			{ kind: "backspace" },
			":d",
			setSuggestions([]),
		);
		expect(r.completionState.status).toBe("idle");
		expect(r.backspace).toBe(true);
	});

	test("staleness resets to idle when commandLine changed", () => {
		const cycling = reduceCompletion(
			idle,
			{ kind: "tab", shift: false },
			":d",
			setSuggestions(["delete", "down"]),
		).completionState;
		const r = reduceCompletion(
			cycling,
			{ kind: "tab", shift: false },
			":de",
			setSuggestions(["delete"]),
		);
		expect(r.completionState.status).toBe("cycling");
		// Session re-derived for the new commandLine
		if (r.completionState.status === "cycling") {
			expect(r.completionState.session.commandLineSnapshot).toBe(":de");
			expect(r.completionState.session.prefix).toBe("de");
		}
	});

	test("Space commits highlighted candidate with trailing space", () => {
		const cycling = reduceCompletion(
			idle,
			{ kind: "tab", shift: false },
			":d",
			setSuggestions(["delete", "down"]),
		).completionState;
		const r = reduceCompletion(
			cycling,
			{ kind: "space" },
			":d",
			setSuggestions([]),
		);
		expect(r.completionState.status).toBe("idle");
		expect(r.committedLine).toBe(":delete ");
	});

	test("Space without cycling appends space", () => {
		const r = reduceCompletion(
			idle,
			{ kind: "space" },
			":",
			setSuggestions([]),
		);
		expect(r.completionState.status).toBe("idle");
		expect(r.shouldAppend).toBe(" ");
	});

	test("Enter commits highlighted candidate and executes", () => {
		const cycling = reduceCompletion(
			idle,
			{ kind: "tab", shift: false },
			":d",
			setSuggestions(["delete", "down"]),
		).completionState;
		const r = reduceCompletion(
			cycling,
			{ kind: "enter" },
			":d",
			setSuggestions([]),
		);
		expect(r.completionState.status).toBe("idle");
		expect(r.executeLine).toBe(":delete");
	});

	test("Enter without cycling executes raw line", () => {
		const r = reduceCompletion(
			idle,
			{ kind: "enter" },
			":delete",
			setSuggestions([]),
		);
		expect(r.completionState.status).toBe("idle");
		expect(r.executeLine).toBe(":delete");
	});
});
