import { describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { createMacroHost, createMacroProject } from "@stateful-mcp/macro-host";
import { HostSessionManager } from "../src/server/host-session-manager";

describe("Phase 7 editor transport", () => {
	test("creates documents and selects the new active document", async () => {
		const root = await mkdtemp(
			join(process.env.TMPDIR ?? "/tmp", "macro-editor-"),
		);
		await createMacroProject({ rootPath: root });
		const host = await createMacroHost({ defaults: {}, projectRoot: root });
		const sessions = new HostSessionManager(host, 60_000, root);
		const initial = await sessions.create({ initialText: "plain text" });
		const result = await sessions.editor(initial.sessionId, {
			operation: "editor.newScratchpad",
			requestId: "new-document",
		});

		expect(result.status).toBe("accepted");
		expect(result.snapshot.documents).toHaveLength(2);
		expect(result.snapshot.activeDocumentId).not.toBe(
			initial.editor.activeDocumentId,
		);

		await sessions.disposeAll();
		await host.dispose();
	});

	test("rejects stale text replacement with the current document snapshot", async () => {
		const root = await mkdtemp(
			join(process.env.TMPDIR ?? "/tmp", "macro-editor-"),
		);
		await createMacroProject({ rootPath: root });
		const host = await createMacroHost({ defaults: {}, projectRoot: root });
		const sessions = new HostSessionManager(host, 60_000, root);
		const initial = await sessions.create();
		const documentId = initial.editor.activeDocumentId!;

		const applied = await sessions.editor(initial.sessionId, {
			operation: "editor.replaceText",
			requestId: "replace-document",
			documentId,
			lines: ["local text"],
			expectedTextRevision: 0,
		});
		expect(applied.status).toBe("accepted");
		expect(applied.textRevision).toBe(1);

		const stale = await sessions.editor(initial.sessionId, {
			operation: "editor.replaceText",
			requestId: "stale-replace",
			documentId,
			lines: ["older local text"],
			expectedTextRevision: 0,
		});
		expect(stale.status).toBe("conflict");
		expect(stale.code).toBe("EDITOR_REVISION_STALE");
		if (stale.status === "conflict") expect(stale.actualTextRevision).toBe(1);
		expect(
			stale.workspaceSnapshot?.editor.activeDocument?.lines[0]?.rawText,
		).toBe("local text");

		const lineRejected = await sessions.editor(initial.sessionId, {
			operation: "editor.executeLine",
			requestId: "execute-line",
			documentId,
			lineNumber: 1,
			expectedTextRevision: 1,
		});
		expect(lineRejected.status).toBe("rejected");
		expect(lineRejected.code).toBe("EDITOR_LINE_NOT_EXECUTABLE");

		const validLines = await sessions.editor(initial.sessionId, {
			operation: "editor.executeValidLines",
			requestId: "execute-valid-lines",
			documentId,
			expectedTextRevision: 1,
		});
		expect(validLines.status).toBe("accepted");
		if (validLines.status === "accepted")
			expect(validLines.skippedLines?.[0]?.lineStatus).toBe("non-macro");

		await sessions.disposeAll();
		await host.dispose();
	});

	test("emits correlated editor operation results", async () => {
		const root = await mkdtemp(
			join(process.env.TMPDIR ?? "/tmp", "macro-editor-"),
		);
		await createMacroProject({ rootPath: root });
		const host = await createMacroHost({ defaults: {}, projectRoot: root });
		const sessions = new HostSessionManager(host, 60_000, root);
		const initial = await sessions.create();
		const events: Array<{ type: string; revision: number; payload: unknown }> =
			[];
		const unsubscribe = sessions.subscribe(initial.sessionId, (event) =>
			events.push(event),
		);
		const documentId = initial.editor.activeDocumentId!;

		await sessions.editor(initial.sessionId, {
			operation: "editor.replaceText",
			requestId: "correlated-replace",
			documentId,
			lines: ["host event text"],
			expectedTextRevision: 0,
		});

		const event = events.find(
			(item) => item.type === "editor.operation.completed",
		);
		expect(event).toBeDefined();
		if (event) {
			const result = (event.payload as { result?: { requestId?: string } })
				.result;
			expect(result?.requestId).toBe("correlated-replace");
			expect(event.revision).toBeGreaterThan(0);
		}

		unsubscribe();
		await sessions.disposeAll();
		await host.dispose();
	});

	test("rejects unavailable template seeds without opening a partial document", async () => {
		const root = await mkdtemp(
			join(process.env.TMPDIR ?? "/tmp", "macro-editor-"),
		);
		await createMacroProject({ rootPath: root });
		const host = await createMacroHost({ defaults: {}, projectRoot: root });
		const sessions = new HostSessionManager(host, 60_000, root);
		const initial = await sessions.create({
			templates: [
				{
					templateId: "seeded-template",
					title: "Seeded template",
					initialText: "",
					cellDefaults: [{ lineNumber: 1, defaultMacroId: "missing-macro" }],
				},
			],
		});

		const result = await sessions.editor(initial.sessionId, {
			operation: "editor.newScratchpadFromTemplate",
			requestId: "missing-template-seed",
			templateId: "seeded-template",
		});
		expect(result.status).toBe("rejected");
		expect(result.code).toBe("EDITOR_TEMPLATE_SEED_UNAVAILABLE");
		expect(result.snapshot.documents).toHaveLength(1);

		await sessions.disposeAll();
		await host.dispose();
	});

	test("keeps editor groups revision-safe while sharing document identity", async () => {
		const root = await mkdtemp(
			join(process.env.TMPDIR ?? "/tmp", "macro-editor-"),
		);
		await createMacroProject({ rootPath: root });
		const host = await createMacroHost({ defaults: {}, projectRoot: root });
		const sessions = new HostSessionManager(host, 60_000, root);
		const initial = await sessions.create();
		const split = await sessions.editor(initial.sessionId, {
			operation: "editor.createSplitGroup",
			requestId: "create-split",
			expectedWorkspaceRevision: 0,
		});
		expect(split.status).toBe("accepted");
		expect(split.snapshot.groups).toHaveLength(2);
		expect(split.snapshot.groups[0]?.documentIds).toEqual(
			split.snapshot.groups[1]?.documentIds,
		);

		const stale = await sessions.editor(initial.sessionId, {
			operation: "editor.focusGroup",
			requestId: "stale-focus",
			groupId: split.snapshot.groups[0]!.groupId,
			expectedWorkspaceRevision: 0,
		});
		expect(stale.status).toBe("conflict");
		expect(stale.code).toBe("EDITOR_WORKSPACE_REVISION_STALE");

		await sessions.disposeAll();
		await host.dispose();
	});

	test("supports duplicateDocument, clearExecutedLines and resetExecutionState operations", async () => {
		const host = await createMacroHost({ defaults: {} });
		const sessions = new HostSessionManager(host, 60_000);
		const initial = await sessions.create({ initialText: "line 1\nline 2" });
		const documentId = initial.editor.activeDocumentId!;

		// Duplicate document
		const dup = await sessions.editor(initial.sessionId, {
			operation: "editor.duplicateDocument",
			requestId: "dup-doc",
			documentId,
			title: "Cloned Scratchpad",
		});
		expect(dup.status).toBe("accepted");
		expect(dup.snapshot.documents).toHaveLength(2);

		// Clear executed lines & reset state
		const clear = await sessions.editor(initial.sessionId, {
			operation: "editor.clearExecutedLines",
			requestId: "clear-lines",
			documentId,
		});
		expect(clear.status).toBe("accepted");

		const reset = await sessions.editor(initial.sessionId, {
			operation: "editor.resetExecutionState",
			requestId: "reset-lines",
			documentId,
		});
		expect(reset.status).toBe("accepted");

		await sessions.disposeAll();
		await host.dispose();
	});
});
