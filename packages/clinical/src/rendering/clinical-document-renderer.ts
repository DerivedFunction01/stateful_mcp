import type { ClinicalDocumentReadModel } from "../clinical/clinical-document-types";
import type { PresentationItem } from "../presentation/field-types";
import { PresentationPolicyRegistry } from "../presentation/policies";
import { createRecordPresentation } from "../presentation/record-projector";
import { TemplateRenderer } from "./template-renderer";
import type { ClinicalProseTemplate } from "./template-types";

export interface RenderedClinicalDocument {
	documentId: string;
	sections: Record<
		"subjective" | "objective" | "assessment" | "plan",
		string[]
	>;
	records: PresentationItem[];
}

/** Renders the final projected  clinical schema without mutating it. */
export class ClinicalDocumentRenderer {
	private readonly policies: PresentationPolicyRegistry;

	constructor(policies?: PresentationPolicyRegistry) {
		this.policies = policies ?? new PresentationPolicyRegistry();
	}

	render(
		document: ClinicalDocumentReadModel,
		templates: readonly ClinicalProseTemplate[] = [],
	): RenderedClinicalDocument {
		const sections = {
			subjective: [],
			objective: [],
			assessment: [],
			plan: [],
		} as RenderedClinicalDocument["sections"];
		const records = Object.values(document.records)
			.filter((record) => !record.removed)
			.map((record) => {
				const presentation = createRecordPresentation(
					record,
					this.policies.get(record.schemaName),
				);
				const prose = TemplateRenderer.renderObject(
					record.values,
					templates,
					record.schemaName,
				);
				if (prose)
					sections[this.sectionFor(record.schemaName, templates)].push(prose);
				return presentation;
			});
		return { documentId: document.documentId, sections, records };
	}

	private sectionFor(
		schema: string,
		templates: readonly ClinicalProseTemplate[],
	): keyof RenderedClinicalDocument["sections"] {
		return (
			templates.find((template) => template.targetSchema === schema)?.section ??
			(schema.toLowerCase().includes("diagnosis")
				? "assessment"
				: schema.toLowerCase().includes("observation") ||
						schema.toLowerCase().includes("vital")
					? "objective"
					: "plan")
		);
	}
}
