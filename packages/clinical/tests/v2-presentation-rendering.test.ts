import { describe, expect, it } from "bun:test";
import { V2ClinicalDocumentRenderer } from "../src/v2/rendering/clinical-document-renderer";
import { V2TemplateRenderer } from "../src/v2/rendering/template-renderer";
import { V2TemplateWalker } from "../src/v2/rendering/template-walker";
import type { ClinicalDocumentReadModel } from "../src/v2/clinical/clinical-document-types";

const document: ClinicalDocumentReadModel = {
	documentId: "doc-render",
	sessionId: "s1",
	patientId: "p1",
	status: "draft",
	amendmentNotes: [],
	version: 1,
	eventHead: "h1",
	records: {
		"dx-1": { recordId: "dx-1", schemaName: "PrimaryDiagnosis", schemaVersion: 1, values: { id: "dx-1", diagnosis: { conceptId: "c1", display: "Pneumonia" } }, version: 1 },
	},
};

describe("V2 presentation and rendering", () => {
	it("projects final clinical records without ParsedItem", () => {
		const rendered = new V2ClinicalDocumentRenderer().render(document);
		expect(rendered.records[0]?.title).toBe("Pneumonia");
		expect(rendered.sections.assessment).toEqual([]);
		expect(rendered.records[0]?.groups[0]?.fields.length).toBeGreaterThan(0);
	});

	it("renders V2 templates and rejects cycles", () => {
		const templates = [{ templateId: "dx", targetSchema: "PrimaryDiagnosis", slotPosition: "full_paragraph" as const, templateText: "Diagnosis: {diagnosis}", slots: { diagnosis: { sourcePath: "diagnosis.display" } } }];
		expect(V2TemplateRenderer.renderObject(document.records["dx-1"]!.values, templates, "PrimaryDiagnosis")).toBe("Diagnosis: Pneumonia");
		V2TemplateWalker.validate(templates);
	});
});
