import type { ClinicalDocumentReadModel } from "../clinical/clinical-document-types";
import type { V2PresentationItem } from "../presentation/field-types";
import { V2PresentationPolicyRegistry } from "../presentation/policies";
import { createV2RecordPresentation } from "../presentation/record-projector";
import { V2TemplateRenderer } from "./template-renderer";
import type { V2ClinicalProseTemplate } from "./template-types";

export interface V2RenderedClinicalDocument {
	documentId: string;
	sections: Record<
		"subjective" | "objective" | "assessment" | "plan",
		string[]
	>;
	records: V2PresentationItem[];
}

/** Renders the final projected V2 clinical schema without mutating it. */
export class V2ClinicalDocumentRenderer {
	private readonly policies: V2PresentationPolicyRegistry;

	constructor(policies?: V2PresentationPolicyRegistry) {
		this.policies = policies ?? new V2PresentationPolicyRegistry();
	}

	render(
		document: ClinicalDocumentReadModel,
		templates: readonly V2ClinicalProseTemplate[] = [],
	): V2RenderedClinicalDocument {
		const sections = {
			subjective: [],
			objective: [],
			assessment: [],
			plan: [],
		} as V2RenderedClinicalDocument["sections"];
		const records = Object.values(document.records)
			.filter((record) => !record.removed)
			.map((record) => {
				const presentation = createV2RecordPresentation(
					record,
					this.policies.get(record.schemaName),
				);
				const prose = V2TemplateRenderer.renderObject(
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
		templates: readonly V2ClinicalProseTemplate[],
	): keyof V2RenderedClinicalDocument["sections"] {
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
