import { describe, expect, test } from "bun:test";
import { WorkspaceKeymapPolicy } from "../src/lib/workspace-keymap-policy";

describe("WorkspaceKeymapPolicy", () => {
	const policy = new WorkspaceKeymapPolicy();

	test("preserves shared cell editing operations", () => {
		expect(policy.resolve("j", {}, "NORMAL", "")).toEqual({
			kind: "document",
			action: { type: "move", delta: 1 },
		});
	});

	test("does not reopen the active workspace for gw", () => {
		expect(policy.resolve("w", {}, "NORMAL", "g")).toEqual({
			kind: "none",
			nextPending: "",
		});
	});
});
