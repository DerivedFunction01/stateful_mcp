import { describe, expect, test } from "bun:test";
import type { Key } from "ink";
import { defaultEditorKeymapProfile } from "../src/bootstrap/editor-keymap-defaults";
import { NotebookKeymapPolicy } from "../src/lib/windows/notebook/keymap-policy";

describe("P4 Overlay and Router key mappings", () => {
	const policy = new NotebookKeymapPolicy(defaultEditorKeymapProfile);

	test("resolves gw key to openWorkspace domain action", () => {
		const res = policy.resolve("w", {} as Key, "NORMAL", "g");
		expect(res.kind).toBe("domain");
		expect(res.action).toEqual({ type: "openWorkspace" } as any);
	});

	test("I key is inert because cells are history records", () => {
		const res = policy.resolve("I", {} as Key, "NORMAL", "");
		expect(res.kind).toBe("none");
	});

	test("resolves q key to quit domain action in VISUAL mode", () => {
		const res = policy.resolve("q", {} as Key, "VISUAL", "");
		expect(res.kind).toBe("domain");
		expect(res.action).toEqual({ type: "quit" } as any);
	});
});
