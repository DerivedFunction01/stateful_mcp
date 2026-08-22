import { describe, expect, test } from "bun:test";
import { ExtensionRuntime } from "../../src/extensions/runtime";
import { MacroDocumentManager } from "../../src/workspace/editor/macro-document-manager";

describe("MacroDocumentManager: Hybrid Documents & Persistence", () => {
	const runtime = new ExtensionRuntime();

	test("initializes with default scratchpad document", () => {
		const manager = new MacroDocumentManager(runtime, {
			defaultTitle: "Scratchpad 1",
			initialText: "patient: Doe",
		});

		const docs = manager.list();
		expect(docs).toHaveLength(1);
		const initial = docs[0]!;
		expect(initial.providerId).toBe("macro.text");
		expect(initial.title).toBe("Scratchpad 1");
		expect(initial.dirty).toBe(false);
		expect(initial.textRevision).toBe(0);
		expect(initial.savedTextRevision).toBe(0);
		expect(initial.filePath).toBeUndefined();
	});

	test("opens a file-backed document and selects it", () => {
		const manager = new MacroDocumentManager(runtime);
		const filePath = "/workspace/notes/clinic_summary.macro";
		const fileDoc = manager.openFile(
			filePath,
			"summary line 1\nsummary line 2",
		);

		expect(fileDoc.providerId).toBe("file");
		expect(fileDoc.filePath).toBe(filePath);
		expect(fileDoc.title).toBe("clinic_summary.macro");
		expect(fileDoc.editor.getLineCount()).toBe(2);
		expect(manager.getActiveDocumentId()).toBe(fileDoc.documentId);

		// Opening the same path returns the existing open document without duplicating
		const existingDoc = manager.openFile(filePath);
		expect(existingDoc.documentId).toBe(fileDoc.documentId);
		expect(manager.list().filter((d) => d.filePath === filePath)).toHaveLength(
			1,
		);
	});

	test("converts a scratchpad to a file-backed document via saveAsFile", () => {
		const manager = new MacroDocumentManager(runtime, {
			defaultTitle: "Untitled Scratchpad",
		});
		const scratchpad = manager.active()!;
		expect(scratchpad.providerId).toBe("macro.text");

		const targetPath = "/workspace/records/patient_record_001.macro";
		const converted = manager.saveAsFile(scratchpad.documentId, targetPath);

		expect(converted.providerId).toBe("file");
		expect(converted.filePath).toBe(targetPath);
		expect(converted.title).toBe("patient_record_001.macro");
	});

	test("tracks savedTextRevision and marks document clean on markSaved", () => {
		const manager = new MacroDocumentManager(runtime);
		const doc = manager.openFile("/workspace/report.macro", "initial text");

		// Modify document
		manager.replaceText({
			documentId: doc.documentId,
			lines: ["initial text", "new observation"],
			expectedTextRevision: doc.textRevision,
		});

		expect(doc.dirty).toBe(true);
		expect(doc.textRevision).toBe(1);
		expect(doc.savedTextRevision).toBe(0);

		// Mark saved with mtime and hash
		const mtime = 1720000000000;
		const hash = "fnv1a:abc1234";
		manager.markSaved(doc.documentId, mtime, hash);

		expect(doc.dirty).toBe(false);
		expect(doc.textRevision).toBe(1);
		expect(doc.savedTextRevision).toBe(1);
		expect(doc.lastDiskMtime).toBe(mtime);
		expect(doc.lastDiskHash).toBe(hash);
	});

	test("reloads text from disk and updates saved revision", () => {
		const manager = new MacroDocumentManager(runtime);
		const doc = manager.openFile(
			"/workspace/external_edit.macro",
			"original text",
		);

		const updatedLines = ["reloaded line 1", "reloaded line 2"];
		const mtime = 1720000050000;
		manager.reloadDiskText(doc.documentId, updatedLines, mtime);

		expect(doc.editor.getLines()).toEqual(updatedLines);
		expect(doc.dirty).toBe(false);
		expect(doc.textRevision).toBe(1);
		expect(doc.savedTextRevision).toBe(1);
		expect(doc.lastDiskMtime).toBe(mtime);
	});

	test("restoring lines to match on-disk content clears dirty state automatically", () => {
		const manager = new MacroDocumentManager(runtime);
		const doc = manager.openFile(
			"/workspace/doc.txt",
			"line 1\nline 2",
		);

		expect(doc.dirty).toBe(false);

		// 1. Edit text -> dirty
		manager.replaceText({
			documentId: doc.documentId,
			lines: ["line 1", "modified line 2"],
			expectedTextRevision: doc.textRevision,
		});
		expect(doc.dirty).toBe(true);

		// 2. Edit back to original on-disk content -> becomes clean
		manager.replaceText({
			documentId: doc.documentId,
			lines: ["line 1", "line 2"],
			expectedTextRevision: doc.textRevision,
		});
		expect(doc.dirty).toBe(false);
	});
});

