import { describe, expect, test } from "bun:test";
import { MacroEditorGroupManager } from "../../src/workspace/editor/editor-group-manager";

function documents() {
	const listeners = new Set<() => void>();
	const items = new Set(["doc-1", "doc-2"]);
	let active = "doc-1";
	return {
		getActiveDocumentId: () => active,
		list: () => [...items].map((documentId) => ({ documentId }) as never),
		get: (documentId: string) =>
			items.has(documentId) ? ({ documentId } as never) : undefined,
		select: (documentId: string) => {
			active = documentId;
		},
		subscribe: (listener: () => void) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
	};
}

describe("MacroEditorGroupManager layout", () => {
	test("creates nested splits with configurable empty behavior", () => {
		const manager = new MacroEditorGroupManager(documents() as never);
		const root = manager.list()[0]!;
		const first = manager.create({
			sourceGroupId: root.groupId,
			documentId: "doc-1",
		});
		const empty = manager.create({
			sourceGroupId: first.groupId,
			behavior: "empty",
		});

		expect(manager.list()).toHaveLength(3);
		expect(empty.documentIds).toEqual([]);
		expect(empty.activeDocumentId).toBeNull();
		expect(manager.getLayoutRoot().kind).toBe("split");
	});

	test("closes a leaf into its nearest sibling and collapses the layout", () => {
		const manager = new MacroEditorGroupManager(documents() as never);
		const root = manager.list()[0]!;
		const sibling = manager.create({ sourceGroupId: root.groupId });
		manager.close(sibling.groupId);

		expect(manager.list()).toHaveLength(1);
		expect(manager.getLayoutRoot()).toEqual({
			kind: "group",
			groupId: root.groupId,
		});
	});

	test("moves a newly created document into only the requested group", () => {
		const manager = new MacroEditorGroupManager(documents() as never);
		const source = manager.list()[0]!;
		const target = manager.create({ sourceGroupId: source.groupId });

		manager.moveDocument("doc-2", target.groupId);

		expect(manager.get(source.groupId)?.documentIds).toEqual(["doc-1"]);
		expect(manager.get(target.groupId)?.documentIds).toEqual([
			"doc-1",
			"doc-2",
		]);
		expect(manager.getActiveGroupId()).toBe(target.groupId);
	});

	test("supports vertical and horizontal directional splits and sibling insertion", () => {
		const docManager = documents();
		const manager = new MacroEditorGroupManager(docManager as never);
		const g1 = manager.list()[0]!;

		// Split vertical (columns)
		const g2 = manager.create({
			sourceGroupId: g1.groupId,
			orientation: "vertical",
		});
		let root = manager.getLayoutRoot();
		expect(root.kind).toBe("split");
		if (root.kind === "split") {
			expect(root.orientation).toBe("vertical");
			expect(root.children).toHaveLength(2);
		}

		// Split vertical again from g2 -> appends as third sibling in vertical split
		const g3 = manager.create({
			sourceGroupId: g2.groupId,
			orientation: "vertical",
		});
		root = manager.getLayoutRoot();
		if (root.kind === "split") {
			expect(root.orientation).toBe("vertical");
			expect(root.children).toHaveLength(3);
		}

		// Split horizontal from g3 -> creates nested horizontal split inside the 3rd child
		const g4 = manager.create({
			sourceGroupId: g3.groupId,
			orientation: "horizontal",
		});
		root = manager.getLayoutRoot();
		if (root.kind === "split") {
			expect(root.children).toHaveLength(3);
			const third = root.children[2];
			expect(third?.kind).toBe("split");
			if (third?.kind === "split") {
				expect(third.orientation).toBe("horizontal");
				expect(third.children).toHaveLength(2);
			}
		}

		// Close g4 -> collapses nested split cleanly
		manager.close(g4.groupId);
		root = manager.getLayoutRoot();
		if (root.kind === "split") {
			expect(root.children).toHaveLength(3);
			expect(root.children[2]?.kind).toBe("group");
		}
	});

	test("updates split ratios via resizeSplit", () => {
		const manager = new MacroEditorGroupManager(documents() as never);
		const g1 = manager.list()[0]!;
		manager.create({ sourceGroupId: g1.groupId, orientation: "vertical" });

		const root = manager.getLayoutRoot();
		expect(root.kind).toBe("split");
		if (root.kind === "split") {
			manager.resizeSplit(root.nodeId, [0.3, 0.7]);
			const updated = manager.getLayoutRoot();
			if (updated.kind === "split") {
				expect(updated.sizeRatios).toEqual([0.3, 0.7]);
			}
		}
	});
});
