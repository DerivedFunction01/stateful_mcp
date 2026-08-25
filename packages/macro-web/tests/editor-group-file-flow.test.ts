import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createMacroHost } from "@stateful-mcp/macro-host";
import { HostSessionManager } from "../src/server/host-session-manager";

describe("editor group file flow", () => {
	test("opens a file into a targeted group and closes it without affecting other groups", async () => {
		const root = await mkdtemp(
			join(process.env.TMPDIR ?? "/tmp", "macro-file-group-"),
		);
		await writeFile(join(root, "shared.ts"), "export const shared = 1;\n");
		const host = await createMacroHost({ defaults: {}, projectRoot: root });
		const sessions = new HostSessionManager(host, 60_000, root);
		try {
			const initial = await sessions.create();
			const sessionId = initial.sessionId;
			const groupA = initial.editor.groups[0]!;

			// Create an empty split group B
			const split = await sessions.editor(sessionId, {
				operation: "editor.createSplitGroup",
				requestId: "r-split",
				sourceGroupId: groupA.groupId,
				behavior: "empty",
				orientation: "vertical",
			});
			const groupB = split.workspaceSnapshot!.editor.groups.find(
				(g) => g.groupId !== groupA.groupId && g.documentIds.length === 0,
			)!;
			expect(groupB.documentIds).toEqual([]);

			// Open a file into group B only
			const opened = await sessions.editor(sessionId, {
				operation: "editor.openFile",
				requestId: "r-open",
				path: "shared.ts",
				groupId: groupB.groupId,
			});
			const openedSnapshot = opened.workspaceSnapshot!;
			const aAfterOpen = openedSnapshot.editor.groups.find(
				(g) => g.groupId === groupA.groupId,
			)!;
			const bAfterOpen = openedSnapshot.editor.groups.find(
				(g) => g.groupId === groupB.groupId,
			)!;
			expect(bAfterOpen.documentIds).toHaveLength(1);
			expect(aAfterOpen.documentIds).toEqual(groupA.documentIds);
			const docId = bAfterOpen.documentIds[0]!;

			// Closing the tab in group B leaves group A intact and does not
			// delete the document globally.
			const closed = await sessions.editor(sessionId, {
				operation: "editor.closeDocumentInGroup",
				requestId: "r-close",
				groupId: groupB.groupId,
				documentId: docId,
			});
			const closedSnapshot = closed.workspaceSnapshot!;
			const bAfterClose = closedSnapshot.editor.groups.find(
				(g) => g.groupId === groupB.groupId,
			)!;
			expect(bAfterClose.documentIds).toEqual([]);
			expect(
				closedSnapshot.editor.documents.some((d) => d.documentId === docId),
			).toBe(true);
		} finally {
			await sessions.disposeAll();
			await host.dispose();
			await rm(root, { recursive: true, force: true });
		}
	});

	test("creates a root file and opens it into the originating group", async () => {
		const root = await mkdtemp(
			join(process.env.TMPDIR ?? "/tmp", "macro-create-group-"),
		);
		const host = await createMacroHost({ defaults: {}, projectRoot: root });
		const sessions = new HostSessionManager(host, 60_000, root);
		try {
			const initial = await sessions.create();
			const sessionId = initial.sessionId;
			const groupA = initial.editor.groups[0]!;

			// Empty group B originates the Create File action.
			const split = await sessions.editor(sessionId, {
				operation: "editor.createSplitGroup",
				requestId: "r-split-2",
				sourceGroupId: groupA.groupId,
				behavior: "empty",
				orientation: "vertical",
			});
			const groupB = split.workspaceSnapshot!.editor.groups.find(
				(g) => g.groupId !== groupA.groupId,
			)!;

			// Root-level creation mirrors the App flow: createFile(".", name)
			// followed by editor.openFile with the pending group ID.
			const created = await sessions.createFile(sessionId, ".", "notes.ts");
			expect(created.path).toBe("notes.ts");

			const opened = await sessions.editor(sessionId, {
				operation: "editor.openFile",
				requestId: "r-open-2",
				path: created.path,
				groupId: groupB.groupId,
			});
			const openedSnapshot = opened.workspaceSnapshot!;
			const b = openedSnapshot.editor.groups.find(
				(g) => g.groupId === groupB.groupId,
			)!;
			expect(b.documentIds).toHaveLength(1);
			const openedDoc = openedSnapshot.editor.documents.find(
				(d) => d.documentId === b.documentIds[0],
			);
			expect(openedDoc?.filePath?.endsWith("notes.ts")).toBe(true);
		} finally {
			await sessions.disposeAll();
			await host.dispose();
			await rm(root, { recursive: true, force: true });
		}
	});

	test("duplicate split references the same document in both groups", async () => {
		const host = await createMacroHost({ defaults: {} });
		const sessions = new HostSessionManager(host, 60_000);
		try {
			const initial = await sessions.create();
			const sessionId = initial.sessionId;
			const groupA = initial.editor.groups[0]!;
			const docId = groupA.activeDocumentId!;
			expect(docId).toBeDefined();

			const split = await sessions.editor(sessionId, {
				operation: "editor.createSplitGroup",
				requestId: "r-split-3",
				sourceGroupId: groupA.groupId,
				behavior: "duplicate",
				orientation: "vertical",
			});
			const groups = split.workspaceSnapshot!.editor.groups;
			expect(groups.filter((g) => g.documentIds.includes(docId))).toHaveLength(
				2,
			);
		} finally {
			await sessions.disposeAll();
			await host.dispose();
		}
	});

	test("rejects an unknown source group with a structured messageKey", async () => {
		const host = await createMacroHost({ defaults: {} });
		const sessions = new HostSessionManager(host, 60_000);
		try {
			const initial = await sessions.create();
			const sessionId = initial.sessionId;

			const result = await sessions.editor(sessionId, {
				operation: "editor.createSplitGroup",
				requestId: "r-bad-group",
				sourceGroupId: "does-not-exist",
				behavior: "empty",
			});

			expect(result.status).toBe("rejected");
			// DocumentManagerError is a key-only descriptor: the canonical
			// rejection carries the structured messageKey with no artificial code.
			expect(result.code).toBeUndefined();
			expect(result.messageKey).toBe("editor.group.notFound");
			// The operation result carries only the structured key, never a
			// human-readable message or the raw Error.message.
			expect(
				(result as unknown as { message?: unknown }).message,
			).toBeUndefined();
		} finally {
			await sessions.disposeAll();
			await host.dispose();
		}
	});
});
