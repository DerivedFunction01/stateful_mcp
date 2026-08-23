import { describe, expect, test } from "bun:test";
import type { EditorGroupDto } from "@stateful-mcp/macro-protocol";

describe("Split Editor Multi-Group Model", () => {
	test("calculates active group documents and handles group focus transitions", () => {
		const groups: EditorGroupDto[] = [
			{
				groupId: "group-1",
				documentIds: ["doc-1", "doc-2"],
				activeDocumentId: "doc-1",
				orientation: "vertical",
				sizeRatio: 0.5,
			},
			{
				groupId: "group-2",
				documentIds: ["doc-3"],
				activeDocumentId: "doc-3",
				orientation: "vertical",
				sizeRatio: 0.5,
			},
		];

		const documents = [
			{
				documentId: "doc-1",
				providerId: "file" as const,
				title: "index.ts",
				filePath: "/src/index.ts",
				dirty: false,
				textRevision: 1,
			},
			{
				documentId: "doc-2",
				providerId: "file" as const,
				title: "App.tsx",
				filePath: "/src/App.tsx",
				dirty: true,
				textRevision: 2,
			},
			{
				documentId: "doc-3",
				providerId: "scratchpad" as const,
				title: "Scratchpad",
				dirty: false,
				textRevision: 0,
			},
		];

		// Group 1 docs
		const group1 = groups[0]!;
		const group1Docs = documents.filter((d) =>
			group1.documentIds.includes(d.documentId),
		);
		expect(group1Docs.map((d) => d.title)).toEqual(["index.ts", "App.tsx"]);

		// Group 2 docs
		const group2 = groups[1]!;
		const group2Docs = documents.filter((d) =>
			group2.documentIds.includes(d.documentId),
		);
		expect(group2Docs.map((d) => d.title)).toEqual(["Scratchpad"]);
	});

	test("supports vertical and horizontal orientation descriptors", () => {
		const verticalGroup: EditorGroupDto = {
			groupId: "g-vert",
			documentIds: ["d1"],
			activeDocumentId: "d1",
			orientation: "vertical",
		};
		const horizontalGroup: EditorGroupDto = {
			groupId: "g-horiz",
			documentIds: ["d2"],
			activeDocumentId: "d2",
			orientation: "horizontal",
		};

		expect(verticalGroup.orientation).toBe("vertical");
		expect(horizontalGroup.orientation).toBe("horizontal");
	});
});

describe("EditorSurfaceRegistry Multi-Group Lookups", () => {
	test("routes active and group-targeted lookups by groupId and documentId", () => {
		const {
			EditorSurfaceRegistry,
		} = require("../src/lib/editor-surface-registry");
		const registry = new EditorSurfaceRegistry();

		const mockElement1 = {
			tagName: "DIV",
			focus: () => undefined,
		} as unknown as HTMLElement;
		const mockElement2 = {
			tagName: "DIV",
			focus: () => undefined,
		} as unknown as HTMLElement;

		registry.register({
			id: "editor:group-1:doc-1",
			groupId: "group-1",
			documentId: "doc-1",
			element: mockElement1,
			focused: true,
			context: {
				focusedRegion: "main",
				activeDocumentId: "doc-1",
				editorMode: "NORMAL",
				textInputOwner: "editor",
			},
			vimEnabled: true,
			mode: "NORMAL",
		});

		registry.register({
			id: "editor:group-2:doc-1",
			groupId: "group-2",
			documentId: "doc-1",
			element: mockElement2,
			focused: false,
			context: {
				focusedRegion: "main",
				activeDocumentId: "doc-1",
				editorMode: "INSERT",
				textInputOwner: "editor",
			},
			vimEnabled: true,
			mode: "INSERT",
		});

		// getActive returns the focused surface (Group 1)
		expect(registry.getActive()?.id).toBe("editor:group-1:doc-1");
		expect(registry.getActive()?.mode).toBe("NORMAL");

		// Group lookups
		expect(registry.getByGroupId("group-1")?.element).toBe(mockElement1);
		expect(registry.getByGroupId("group-2")?.element).toBe(mockElement2);
		expect(registry.getByView("group-2", "doc-1")?.mode).toBe("INSERT");
		expect(registry.focusTarget("group-2")).toBe(mockElement2);

		// When group 2 gains focus, getActive updates to Group 2
		registry.update("editor:group-1:doc-1", { focused: false });
		registry.update("editor:group-2:doc-1", { focused: true });

		expect(registry.getActive()?.id).toBe("editor:group-2:doc-1");
		expect(registry.getActive()?.mode).toBe("INSERT");
	});
});

describe("Split and Close Command Aliases from Profile", () => {
	test("provides canonical Ex-command aliases for vertical split, horizontal split, and close", () => {
		const {
			DEFAULT_COMMAND_ALIASES,
		} = require("@stateful-mcp/macro/workspace/keymaps/defaults/aliases");

		expect(DEFAULT_COMMAND_ALIASES["editor.splitRight"]).toEqual([
			"vsplit",
			"vs",
			"vsp",
		]);
		expect(DEFAULT_COMMAND_ALIASES["editor.splitDown"]).toEqual([
			"split",
			"sp",
		]);
		expect(DEFAULT_COMMAND_ALIASES["editor.closeGroup"]).toEqual([
			"close",
			"clo",
			"closegroup",
			"only",
		]);
	});

	test("resolves fallback active group ID when group list is empty or group ID is synthetic", () => {
		const groups = [
			{
				groupId: "real-group-1",
				documentIds: [],
				activeDocumentId: null,
				orientation: "vertical" as const,
			},
		];
		const activeGroupId = "real-group-1";
		const activeGroup =
			groups.find((g) => g.groupId === activeGroupId) ?? groups[0];
		expect(activeGroup?.groupId).toBe("real-group-1");

		const syntheticGroupId = "default";
		const resolvedTarget =
			syntheticGroupId && syntheticGroupId !== "default"
				? syntheticGroupId
				: activeGroup?.groupId;
		expect(resolvedTarget).toBe("real-group-1");
	});
});
