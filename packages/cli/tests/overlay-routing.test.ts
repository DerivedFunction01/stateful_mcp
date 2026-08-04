import { describe, expect, test } from "bun:test";
import type { Key } from "ink";
import { NotebookKeymapPolicy } from "../src/lib/windows/notebook/keymap-policy";
import { defaultEditorKeymapProfile } from "../src/bootstrap/editor-keymap-defaults";

describe("P4 Overlay and Router key mappings", () => {
	const policy = new NotebookKeymapPolicy(defaultEditorKeymapProfile);

	test("resolves gw key to openWorkspace domain action", () => {
		const res = policy.resolve("w", {} as Key, "NORMAL", "g");
		expect(res.kind).toBe("domain");
		expect(res.action).toEqual({ type: "openWorkspace" } as any);
	});

	test("resolves I key to showInfo domain action", () => {
		const res = policy.resolve("I", {} as Key, "NORMAL", "");
		expect(res.kind).toBe("domain");
		expect(res.action).toEqual({ type: "showInfo" } as any);
	});

	test("resolves q key to quit domain action in VISUAL mode", () => {
		const res = policy.resolve("q", {} as Key, "VISUAL", "");
		expect(res.kind).toBe("domain");
		expect(res.action).toEqual({ type: "quit" } as any);
	});
});
