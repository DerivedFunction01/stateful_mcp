import { describe, expect, test } from "bun:test";
import { defaultEditorKeymapProfile } from "../src/bootstrap/editor-keymap-defaults";
import { NotebookKeymapPolicy } from "../src/lib/windows/notebook/keymap-policy";

const policy = new NotebookKeymapPolicy(defaultEditorKeymapProfile);

describe("NotebookKeymapPolicy", () => {
	test("NORMAL j/k resolve to document move actions", () => {
		expect(policy.resolve("j", {}, "NORMAL", "")).toEqual({
			kind: "document",
			action: { type: "move", delta: 1 },
		});
		expect(policy.resolve("k", {}, "NORMAL", "")).toEqual({
			kind: "document",
			action: { type: "move", delta: -1 },
		});
	});

	test("NORMAL i resolves to generic enter-insert", () => {
		expect(policy.resolve("i", {}, "NORMAL", "")).toEqual({
			kind: "generic",
			action: { type: "ENTER_INSERT" },
		});
	});

	test("NORMAL ':' resolves to generic enter-command", () => {
		expect(policy.resolve(":", {}, "NORMAL", "")).toEqual({
			kind: "generic",
			action: { type: "ENTER_COMMAND" },
		});
	});

	test("NORMAL macro token follows the active syntax profile", () => {
		const configuredPolicy = new NotebookKeymapPolicy({
			...defaultEditorKeymapProfile,
			normal: { ...defaultEditorKeymapProfile.normal, macro: "~" },
		});
		expect(configuredPolicy.resolve("~", {}, "NORMAL", "")).toEqual({
			kind: "generic",
			action: { type: "ENTER_MACRO" },
		});
		expect(configuredPolicy.resolve("^", {}, "NORMAL", "").kind).toBe("none");
	});

	test("dd pending sequence returns none with nextPending", () => {
		expect(policy.resolve("d", {}, "NORMAL", "")).toEqual({
			kind: "none",
			nextPending: "d",
		});
		const second = policy.resolve("d", {}, "NORMAL", "d");
		// dd deletes the active cell.
		expect(second.kind).toBe("document");
		if (second.kind === "document") {
			expect(second.action.type).toBe("deleteActive");
		}
	});

	test("r resolves to domain run", () => {
		const result = policy.resolve("r", {}, "NORMAL", "");
		expect(result.kind).toBe("domain");
		if (result.kind === "domain") {
			expect(result.action.type).toBe("run");
		}
	});

	test("[e and ]e resolve to error-navigation document actions", () => {
		expect(policy.resolve("e", {}, "NORMAL", "[")).toEqual({
			kind: "document",
			action: { type: "prevError" },
		});
		expect(policy.resolve("e", {}, "NORMAL", "]")).toEqual({
			kind: "document",
			action: { type: "nextError" },
		});
	});

	test("INSERT char resolves to generic insert-text", () => {
		const result = policy.resolve("x", {}, "INSERT", "");
		expect(result.kind).toBe("generic");
		expect(result).toEqual({
			kind: "generic",
			action: { type: "INSERT_TEXT", text: "x" },
		});
	});

	test("INSERT Enter remains newline regardless of Ctrl modifier", () => {
		expect(policy.resolve("\r", { return: true }, "INSERT", "")).toEqual({
			kind: "generic",
			action: { type: "INSERT_TEXT", text: "\n" },
		});
		expect(
			policy.resolve("\r", { return: true, ctrl: true }, "INSERT", ""),
		).toEqual({
			kind: "generic",
			action: { type: "INSERT_TEXT", text: "\n" },
		});
	});

	test("MACRO Enter resolves to submit-macro", () => {
		expect(policy.resolve("\r", { return: true }, "MACRO", "")).toEqual({
			kind: "generic",
			action: { type: "SUBMIT_MACRO" },
		});
	});

	test("VISUAL Esc resolves to generic cancel", () => {
		const result = policy.resolve("\x1b", { escape: true }, "VISUAL", "");
		expect(result.kind).toBe("generic");
		expect(result).toEqual({
			kind: "generic",
			action: { type: "CANCEL" },
		});
	});

	test("VISUAL V returns none", () => {
		const result = policy.resolve("V", {}, "VISUAL", "");
		expect(result.kind).toBe("none");
	});
});
