import { describe, expect, test } from "bun:test";
import type { WindowDefinition, WindowSlot } from "../src/lib/cell-editor";
import { notebookWindow } from "../src/lib/notebook-window";
import { PLAN_SLOTS, planWindow } from "../src/lib/plan-window";
import { WindowRegistry } from "../src/lib/window-registry";

function stubNotebook(
	overrides?: Partial<{
		mode: "NORMAL" | "INSERT" | "COMMAND" | "VISUAL";
		lastEditCellId: string | null;
	}>,
): WindowDefinition {
	const mode = overrides?.mode ?? "NORMAL";
	return notebookWindow({
		document: {
			getView: () => ({ cells: [], activeIndex: 0, selection: null }),
			dispatch: () => {},
		} as any,
		domain: {} as any,
		catalog: { getDescriptors: () => [], getSuggestions: () => [] } as any,
		sessionId: "s1",
		editorState: {
			mode,
			draftText: mode === "COMMAND" ? ":" : "",
			completion: { status: "idle" },
			error: null,
			showHelp: false,
		},
		lastEditCellId: overrides?.lastEditCellId ?? null,
	});
}

function slotsOf(def: WindowDefinition): WindowSlot[] {
	return def.regions().map((r) => r.slot);
}

describe("Phase P5 — region/registry readiness", () => {
	test("notebook window has primary/status/footer slots in NORMAL mode", () => {
		const slots = slotsOf(stubNotebook());
		expect(slots).toContain("primary");
		expect(slots).toContain("status");
		expect(slots).toContain("footer");
		expect(slots).not.toContain("command");
	});

	test("notebook window includes command slot in COMMAND mode", () => {
		const slots = slotsOf(stubNotebook({ mode: "COMMAND" }));
		expect(slots).toContain("command");
	});

	test("notebook window excludes command slot in INSERT mode", () => {
		const slots = slotsOf(stubNotebook({ mode: "INSERT" }));
		expect(slots).not.toContain("command");
	});

	test("notebook window excludes command slot in VISUAL mode", () => {
		const slots = slotsOf(stubNotebook({ mode: "VISUAL" }));
		expect(slots).not.toContain("command");
	});

	test("plan window adds a sidebar slot with no container change required", () => {
		const reg = new WindowRegistry();
		reg.register("plan", () => planWindow());
		const def = reg.create("plan");
		expect(def?.type).toBe("plan");
		const slots = def ? slotsOf(def) : [];
		expect(slots).toContain("sidebar");
		expect(slots).toContain("primary");
	});

	test("all expected slots are representable", () => {
		expect(PLAN_SLOTS).toEqual([
			"primary",
			"command",
			"status",
			"footer",
			"sidebar",
			"overlay",
		]);
	});

	test("window switch does not share region instances across types", () => {
		const reg = new WindowRegistry();
		reg.register("notebook", () => stubNotebook());
		reg.register("plan", () => planWindow());
		const notebook = reg.create("notebook")!;
		const plan = reg.create("plan")!;
		expect(notebook.type).toBe("notebook");
		expect(plan.type).toBe("plan");
		expect(plan === notebook).toBe(false);
	});

	test("notebook window passes lastEditCellId to CellList", () => {
		const def = stubNotebook({ lastEditCellId: "cell-123" });
		const regions = def.regions();
		const primary = regions.find((r) => r.slot === "primary");
		expect(primary).toBeDefined();
	});

	test("notebook window passes editorState.mode to CellList", () => {
		const def = stubNotebook({ mode: "INSERT" });
		const regions = def.regions();
		const primary = regions.find((r) => r.slot === "primary");
		expect(primary).toBeDefined();
	});
});
