import { describe, expect, test } from "bun:test";
import { notebookWindow } from "../src/lib/notebook-window";
import { WindowRegistry } from "../src/lib/window-registry";

function stubNotebook() {
	return notebookWindow({
		document: {
			getView: () => ({ cells: [], activeIndex: 0, selection: null }),
			dispatch: () => {},
		} as any,
		domain: {} as any,
		catalog: { getDescriptors: () => [], getSuggestions: () => [] } as any,
		sessionId: "s1",
		editorState: {
			mode: "NORMAL",
			draftText: "",
			completion: { status: "idle" },
			error: null,
			showHelp: false,
		},
	});
}

describe("WindowRegistry", () => {
	test("registers and creates window definitions", () => {
		const registry = new WindowRegistry();
		registry.register("notebook", () => stubNotebook());
		expect(registry.has("notebook")).toBe(true);
		const def = registry.create("notebook");
		expect(def?.type).toBe("notebook");
		expect(def?.regions().length).toBeGreaterThan(0);
	});

	test("adding a new window type requires no container change", () => {
		const registry = new WindowRegistry();
		registry.register("plan", () => ({
			type: "plan",
			regions: () => [],
		}));
		const def = registry.create("plan");
		expect(def?.type).toBe("plan");
		expect(registry.list()).toContain("plan");
	});
});
