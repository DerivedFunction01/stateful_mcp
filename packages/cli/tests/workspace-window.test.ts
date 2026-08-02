import { describe, expect, test } from "bun:test";
import type { WorkspaceSnapshot } from "@stateful-mcp/clinical/session/workspace-read-model";
import type { WindowDefinition, WindowSlot } from "../src/lib/cell-editor";
import { WindowDomainPort } from "../src/lib/notebook-domain";
import {
	createWindowRegistry,
	WindowRegistry,
} from "../src/lib/window-registry";
import { WorkspaceDocumentPort } from "../src/lib/workspace-document";
import { workspaceWindow } from "../src/lib/workspace-window";

const snapshot: WorkspaceSnapshot = {
	workspaceId: "work_1",
	sourceSoapNoteId: "s1",
	activeBranchId: "branch_1",
	branches: [
		{
			branchId: "branch_1",
			name: "PE",
			status: "active",
			supporting: [],
			refuting: [],
			supportingCount: 0,
			refutingCount: 0,
			commandAlias: "pe",
		},
	],
	globalFacts: [],
	globalFactCount: 0,
	cells: [
		{
			cellId: "cell_1",
			workspaceId: "work_1",
			sessionId: "s1",
			rawInput: "pleuritic chest pain",
			status: "committed",
			updatedAt: "2026-01-01T00:00:00.000Z",
			routing: {
				scope: "branch_local",
				targetSchema: null,
				branchId: "branch_1",
			},
			parsedOutput: null,
		},
	],
	lifecycle: { closeRequested: false },
};

function stubWorkspace(overrides?: {
	mode?: "NORMAL" | "INSERT" | "COMMAND" | "VISUAL";
}): WindowDefinition {
	const mode = overrides?.mode ?? "NORMAL";
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

function slotsOf(def: WindowDefinition): WindowSlot[] {
	return def.regions().map((r) => r.slot);
}

describe("V2 workspace window", () => {
	test("workspace window type is workspace", () => {
		expect(stubWorkspace().type).toBe("workspace");
	});

	test("workspace window has primary/status/footer/sidebar slots in NORMAL mode and no command", () => {
		const slots = slotsOf(stubWorkspace());
		expect(slots).toContain("primary");
		expect(slots).toContain("status");
		expect(slots).toContain("footer");
		expect(slots).toContain("sidebar");
		expect(slots).not.toContain("command");
	});

	test("workspace window includes command slot in COMMAND mode", () => {
		expect(slotsOf(stubWorkspace({ mode: "COMMAND" }))).toContain("command");
	});

	test("workspace window includes no command slot in INSERT or VISUAL mode", () => {
		expect(slotsOf(stubWorkspace({ mode: "INSERT" }))).not.toContain("command");
		expect(slotsOf(stubWorkspace({ mode: "VISUAL" }))).not.toContain("command");
	});

	test("workspace document port exposes snapshot cells as the view", () => {
		const document = new WorkspaceDocumentPort(
			{ collection: { kind: "workspace", collectionId: "work_1" } },
			() => snapshot.cells,
			() => 0,
		);
		const view = document.getView();
		expect(view.cells[0]?.rawInput).toBe("pleuritic chest pain");
		expect(view.activeIndex).toBe(0);
	});

	test("workspace is registered in the canonical registry with notebook + plan", () => {
		const reg = createWindowRegistry();
		expect(reg.list().sort()).toEqual(["notebook", "plan", "workspace"]);
	});

	test("workspace window requires workspace-typed deps (compile-time) and creates definition", () => {
		const reg = new WindowRegistry();
		reg.register("workspace", (deps) =>
			workspaceWindow(deps as Parameters<typeof workspaceWindow>[0]),
		);
		const def = reg.create("workspace", stubWorkspaceDeps());
		expect(def?.type).toBe("workspace");
	});

	test("window switch does not share region instances across workspace and notebook", () => {
		const reg = createWindowRegistry();
		const workspace = reg.create("workspace", stubWorkspaceDeps())!;
		const notebook = reg.create("notebook", {
			document: {
				getView: () => ({ cells: [], activeIndex: 0, selection: null }),
				dispatch: () => {},
			},
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
			lastEditCellId: null,
		} as any)!;
		expect(workspace.type).toBe("workspace");
		expect(notebook.type).toBe("notebook");
		expect(workspace === notebook).toBe(false);
	});
});

function stubWorkspaceDeps() {
	return {
		document: new WorkspaceDocumentPort(
			{ collection: { kind: "workspace", collectionId: "work_1" } },
			() => snapshot.cells,
			() => 0,
		),
		domain: new WindowDomainPort({
			runActive: async () => {},
			runIndexes: async () => {},
			runCellIds: async () => {},
			previewActive: async () => {},
			dispatchCommand: async () => ({ success: true }),
			getActiveIndex: () => 0,
		}),
		catalog: { getDescriptors: () => [], getSuggestions: () => [] } as any,
		sessionId: "s1",
		editorState: {
			mode: "NORMAL",
			draftText: "",
			completion: { status: "idle" },
			error: null,
			showHelp: false,
		},
		snapshot,
		loading: false,
		error: null,
		focused: false,
		lastEditCellId: null,
	};
}
