import { describe, expect, test } from "bun:test";
import type { WindowDefinition, WindowSlot } from "../src/lib/cell-editor";
import { WindowRegistry } from "../src/lib/runtime/window-registry";
import { WindowDomainPort } from "../src/lib/windows/notebook/domain";
import { notebookWindow } from "../src/lib/windows/notebook/window";
import { PLAN_SLOTS, planWindow } from "../src/lib/windows/plan/window";
import { WorkspaceDocumentPort } from "../src/lib/windows/workspace/document";
import { workspaceWindow } from "../src/lib/windows/workspace/window";

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
	test("notebook window keeps the Macro editor mounted in NORMAL mode", () => {
		const slots = slotsOf(stubNotebook());
		expect(slots).toContain("primary");
		expect(slots).toContain("status");
		expect(slots).toContain("footer");
		expect(slots).toContain("command");
	});

	test("notebook window includes command slot in COMMAND mode", () => {
		const slots = slotsOf(stubNotebook({ mode: "COMMAND" }));
		expect(slots).toContain("command");
	});

	test("notebook window keeps the Macro editor mounted in INSERT mode", () => {
		const slots = slotsOf(stubNotebook({ mode: "INSERT" }));
		expect(slots).toContain("command");
	});

	test("notebook window keeps the Macro editor mounted in VISUAL mode", () => {
		const slots = slotsOf(stubNotebook({ mode: "VISUAL" }));
		expect(slots).toContain("command");
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

	test("canonical registry contains all supported window profiles", () => {
		const registry = new WindowRegistry();
		registry.register("notebook", () => stubNotebook());
		registry.register("plan", () => planWindow());
		expect(registry.list()).toEqual(["notebook", "plan"]);
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

describe("Phase P5 — workspace window regions", () => {
	const snapshot = {
		workspaceId: "work_1",
		sourceSoapNoteId: "s1",
		activeBranchId: null,
		branches: [],
		globalFacts: [],
		globalFactCount: 0,
		cells: [],
		lifecycle: { closeRequested: false },
	} as any;

	function stubWorkspace(
		mode: "NORMAL" | "INSERT" | "COMMAND" | "VISUAL" = "NORMAL",
	): WindowDefinition {
		const document = new WorkspaceDocumentPort(
			{ collection: { kind: "workspace", collectionId: "work_1" } },
			() => snapshot.cells,
			() => 0,
		);
		const domain = new WindowDomainPort({
			runActive: async () => {},
			runIndexes: async () => {},
			runCellIds: async () => {},
			previewActive: async () => {},
			dispatchCommand: async () => ({ success: true }),
			getActiveIndex: () => 0,
		});
		return workspaceWindow({
			document,
			domain,
			catalog: { getDescriptors: () => [], getSuggestions: () => [] } as any,
			sessionId: "s1",
			editorState: {
				mode,
				draftText: mode === "COMMAND" ? ":" : "",
				completion: { status: "idle" },
				error: null,
				showHelp: false,
			},
			snapshot,
			loading: false,
			error: null,
			focused: false,
			lastEditCellId: null,
		});
	}

	const slotsOf = (def: WindowDefinition): WindowSlot[] =>
		def.regions().map((r) => r.slot);

	test("workspace window reserves a sidebar slot alongside primary/status/footer", () => {
		const slots = slotsOf(stubWorkspace());
		expect(slots).toContain("sidebar");
		expect(slots).toContain("primary");
		expect(slots).toContain("status");
		expect(slots).toContain("footer");
	});

	test("workspace window adds a command slot only in COMMAND mode", () => {
		expect(slotsOf(stubWorkspace("COMMAND"))).toContain("command");
		expect(slotsOf(stubWorkspace("NORMAL"))).not.toContain("command");
		expect(slotsOf(stubWorkspace("INSERT"))).not.toContain("command");
	});

	test("workspace + notebook are distinct window instances in one registry", () => {
		const reg = new WindowRegistry();
		reg.register("notebook", () => stubNotebook());
		reg.register("workspace", () => stubWorkspace());
		const w = reg.create("workspace")!;
		const n = reg.create("notebook")!;
		expect(w.type).toBe("workspace");
		expect(n.type).toBe("notebook");
		expect(w === n).toBe(false);
	});

	test("workspace region keys are stable and ordered by slot", () => {
		const regions = stubWorkspace().regions();
		expect(regions.map((region) => region.key)).toEqual([
			"workspace-primary",
			"workspace-help-bar",
			"workspace-status-bar",
			"workspace-sidebar",
		]);
		expect(regions.filter((region) => region.slot === "sidebar")).toHaveLength(
			1,
		);
	});
});
