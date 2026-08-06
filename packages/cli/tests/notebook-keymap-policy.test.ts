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

	test("NORMAL i resolves to the transient Macro editor", () => {
		expect(policy.resolve("i", {}, "NORMAL", "")).toEqual({
			kind: "generic",
			action: { type: "ENTER_MACRO" },
		});
	});

	test("NORMAL o and O open the transient Macro editor instead of cells", () => {
		expect(policy.resolve("o", {}, "NORMAL", "")).toEqual({
			kind: "generic",
			action: { type: "ENTER_MACRO" },
		});
		expect(policy.resolve("O", {}, "NORMAL", "")).toEqual({
			kind: "generic",
			action: { type: "ENTER_MACRO" },
		});
	});

	test("NORMAL Enter does not submit the persistent editor buffer", () => {
		expect(policy.resolve("\r", { return: true }, "NORMAL", "")).toEqual({
			kind: "none",
			nextPending: "",
		});
	});

	test("cell run and preview keys are inert while I toggles detail", () => {
		expect(policy.resolve("r", {}, "NORMAL", "").kind).toBe("none");
		expect(policy.resolve("P", {}, "NORMAL", "").kind).toBe("none");
		expect(policy.resolve("I", {}, "NORMAL", "")).toEqual({
			kind: "generic",
			action: { type: "TOGGLE_SIDEBAR" },
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
		expect(second.kind).toBe("none");
	});

	test("r is inert because cells are history records", () => {
		const result = policy.resolve("r", {}, "NORMAL", "");
		expect(result.kind).toBe("none");
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

	test("INSERT without a Macro command kind does not edit a cell", () => {
		const result = policy.resolve("x", {}, "INSERT", "");
		expect(result.kind).toBe("none");
	});

	test("INSERT Enter does not submit or edit a cell without Macro context", () => {
		expect(policy.resolve("\r", { return: true }, "INSERT", "").kind).toBe(
			"none",
		);
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
