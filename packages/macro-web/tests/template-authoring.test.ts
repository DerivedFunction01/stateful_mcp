import { describe, expect, test } from "bun:test";
import { ExtensionRuntime, MacroDocumentManager } from "@stateful-mcp/macro";
import type { ScratchpadTemplateDescriptor } from "@stateful-mcp/macro-protocol";

describe("MacroDocumentManager: template authoring, tagging, and persistence", () => {
	test("saves and retrieves custom mutable templates", () => {
		const runtime = new ExtensionRuntime();
		const manager = new MacroDocumentManager(runtime);
		const newTemplate: ScratchpadTemplateDescriptor = {
			templateId: "custom_daily_review",
			providerId: "macro.text",
			title: "Daily Review",
			description: "Daily review routine",
			tags: ["review", "daily"],
			pinnedMacroIds: ["notes", "tasks"],
			initialText: 'notes date="today"\ntasks status="pending"',
			source: "project",
		};

		manager.saveTemplate(newTemplate);

		const found = manager
			.getTemplates()
			.find((t) => t.templateId === "custom_daily_review");
		expect(found).toBeDefined();
		expect(found?.title).toBe("Daily Review");
		expect(found?.tags).toEqual(["review", "daily"]);
		expect(found?.pinnedMacroIds).toEqual(["notes", "tasks"]);
	});

	test("updates an existing template without duplicating", () => {
		const runtime = new ExtensionRuntime();
		const manager = new MacroDocumentManager(runtime);
		const t1: ScratchpadTemplateDescriptor = {
			templateId: "weekly_summary",
			providerId: "macro.text",
			title: "Weekly Summary v1",
			source: "project",
		};
		manager.saveTemplate(t1);

		const t2: ScratchpadTemplateDescriptor = {
			templateId: "weekly_summary",
			providerId: "macro.text",
			title: "Weekly Summary v2",
			tags: ["weekly", "reporting"],
			source: "project",
		};
		manager.saveTemplate(t2);

		const matches = manager
			.getTemplates()
			.filter((t) => t.templateId === "weekly_summary");
		expect(matches.length).toBe(1);
		expect(matches[0]?.title).toBe("Weekly Summary v2");
		expect(matches[0]?.tags).toEqual(["weekly", "reporting"]);
	});

	test("opens template for editing as a macro.template document", () => {
		const runtime = new ExtensionRuntime();
		const manager = new MacroDocumentManager(runtime);
		const template: ScratchpadTemplateDescriptor = {
			templateId: "editable_template",
			providerId: "macro.text",
			title: "Editable Template",
			initialText: '^patient id="123" name="John"\n^vitals bp="120/80"',
			tags: ["#review", "#clinical"],
			source: "project",
		};
		manager.saveTemplate(template);

		const doc = manager.openTemplateForEditing("editable_template");
		expect(doc).toBeDefined();
		expect(doc.providerId).toBe("macro.template");
		expect(doc.templateId).toBe("editable_template");
		expect(doc.title).toBe("Editable Template");
		expect(doc.editor.getLines()).toEqual([
			'^patient id="123" name="John"',
			'^vitals bp="120/80"',
		]);

		// Re-opening selects existing document rather than duplicating
		const doc2 = manager.openTemplateForEditing("editable_template");
		expect(doc2.documentId).toBe(doc.documentId);
	});

	test("filters templates using locale-agnostic Unicode matching", () => {
		const runtime = new ExtensionRuntime();
		const manager = new MacroDocumentManager(runtime);
		manager.saveTemplate({
			templateId: "t_es",
			title: "Consulta Médica",
			tags: ["cirugía", "consulta"],
			source: "project",
		});
		manager.saveTemplate({
			templateId: "t_jp",
			title: "日常レポート",
			tags: ["臨床", "日課"],
			source: "project",
		});

		// Search unaccented "cirugia" matches "cirugía"
		const matchEs = manager.findTemplatesByTags(["cirugia"]);
		expect(matchEs.length).toBe(1);
		expect(matchEs[0]?.templateId).toBe("t_es");

		// Search CJK tag
		const matchJp = manager.findTemplatesByTags(["臨床"]);
		expect(matchJp.length).toBe(1);
		expect(matchJp[0]?.templateId).toBe("t_jp");
	});

	test("keeps live template text synchronized for scratchpad instantiation", () => {
		const manager = new MacroDocumentManager(new ExtensionRuntime());
		manager.saveTemplate({
			templateId: "daily_note",
			title: "Daily Note",
			initialText: "original",
			source: "project",
		});

		const templateDocument = manager.openTemplateForEditing("daily_note");
		const authoredLines = [
			"## Daily Clinical Note",
			'^patient id="123" dept="Cardiology"',
			"# Attending: Dr. Smith",
		];
		manager.replaceText({
			documentId: templateDocument.documentId,
			lines: authoredLines,
			expectedTextRevision: templateDocument.textRevision,
		});

		expect(
			manager.getTemplates().find((item) => item.templateId === "daily_note")
				?.initialText,
		).toBe(authoredLines.join("\n"));
		expect(manager.createFromTemplate("daily_note").editor.getLines()).toEqual(
			authoredLines,
		);
	});
});
