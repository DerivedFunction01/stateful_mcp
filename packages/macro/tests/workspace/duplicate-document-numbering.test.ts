import { describe, expect, test } from "bun:test";
import { ExtensionRuntime } from "../../src/extensions/runtime";
import { MacroDocumentManager } from "../../src/workspace/editor/macro-document-manager";
import { DEFAULT_COMMAND_ALIASES } from "../../src/workspace/keymaps/defaults/aliases";
import { DEFAULT_COMMAND_KEYBINDINGS } from "../../src/workspace/keymaps/defaults/commands";

describe("MacroDocumentManager: duplicate document numbering", () => {
	test("generates incrementing numbered copy titles (1, 2, 3)", () => {
		const runtime = new ExtensionRuntime();
		const manager = new MacroDocumentManager(runtime);
		const doc1 = manager.createBlank("scratchpad.macro");
		expect(doc1.title).toBe("scratchpad.macro");

		const copy1 = manager.duplicateDocument(doc1.documentId);
		expect(copy1.title).toBe("scratchpad (1).macro");

		const copy2 = manager.duplicateDocument(doc1.documentId);
		expect(copy2.title).toBe("scratchpad (2).macro");

		const copy3 = manager.duplicateDocument(copy2.documentId);
		expect(copy3.title).toBe("scratchpad (3).macro");
	});

	test("handles extensionless document titles", () => {
		const runtime = new ExtensionRuntime();
		const manager = new MacroDocumentManager(runtime);
		const doc = manager.createBlank("clinical-vitals");
		const copy1 = manager.duplicateDocument(doc.documentId);
		expect(copy1.title).toBe("clinical-vitals (1)");
		const copy2 = manager.duplicateDocument(doc.documentId);
		expect(copy2.title).toBe("clinical-vitals (2)");
	});

	test("preserves custom newTitle if provided", () => {
		const runtime = new ExtensionRuntime();
		const manager = new MacroDocumentManager(runtime);
		const doc = manager.createBlank("doc.macro");
		const copy = manager.duplicateDocument(
			doc.documentId,
			"custom-clone.macro",
		);
		expect(copy.title).toBe("custom-clone.macro");
	});
});

describe("Vim command aliases and shortcuts", () => {
	test("includes standard Ex-command aliases for editor and project operations", () => {
		expect(DEFAULT_COMMAND_ALIASES["editor.save"]).toContain("w");
		expect(DEFAULT_COMMAND_ALIASES["editor.saveAll"]).toContain("wa");
		expect(DEFAULT_COMMAND_ALIASES["editor.saveAndClose"]).toContain("wq");
		expect(DEFAULT_COMMAND_ALIASES["editor.duplicateDocument"]).toContain(
			"dup",
		);
		expect(DEFAULT_COMMAND_ALIASES["editor.duplicateDocument"]).toContain(
			"duplicate",
		);
		expect(DEFAULT_COMMAND_ALIASES["editor.newScratchpad"]).toContain("new");
		expect(DEFAULT_COMMAND_ALIASES["editor.splitRight"]).toContain("vsplit");
		expect(DEFAULT_COMMAND_ALIASES["editor.splitDown"]).toContain("split");
		expect(DEFAULT_COMMAND_ALIASES["workbench.openProject"]).toContain(
			"openproject",
		);
		expect(DEFAULT_COMMAND_ALIASES["workbench.saveAsProject"]).toContain(
			"saveproject",
		);
	});

	test("includes canonical keybindings for Open, Save As, and Save All", () => {
		const openBinding = DEFAULT_COMMAND_KEYBINDINGS.find(
			(b) => b.command === "workbench.openProject",
		);
		expect(openBinding?.chords).toContain("primary+o");

		const saveAsBinding = DEFAULT_COMMAND_KEYBINDINGS.find(
			(b) => b.command === "workbench.saveAsProject",
		);
		expect(saveAsBinding?.chords).toContain("primary+shift+s");

		const saveAllBinding = DEFAULT_COMMAND_KEYBINDINGS.find(
			(b) => b.command === "editor.saveAll",
		);
		expect(saveAllBinding?.chords).toContain("primary+alt+s");
	});
});
