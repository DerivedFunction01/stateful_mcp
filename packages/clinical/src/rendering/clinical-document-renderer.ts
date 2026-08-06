import type { ClinicalDocumentReadModel } from "../clinical/clinical-document-types";
import type { PresentationItem } from "../presentation/field-types";
import { PresentationPolicyRegistry } from "../presentation/policies";
import { createRecordPresentation } from "../presentation/record-projector";
import { ProseRenderLookupCache } from "./prose-render-context";
import { TemplateRenderer } from "./template-renderer";
import type {
	ClinicalProseTemplate,
	ProseRenderContext,
} from "./template-types";

export interface ClinicalDocumentRenderOptions {
	rootTemplateId?: string;
	slotOverrides?: Record<string, string>;
}

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
	static async renderRecordAsync(
		values: Record<string, unknown>,
		schemaName: string,
		templates: readonly ClinicalProseTemplate[],
		context: ProseRenderContext = {},
		rootTemplateId?: string,
		lookupCache = new ProseRenderLookupCache(context),
	): Promise<string | null> {
		return TemplateRenderer.renderObjectAsync(
			values,
			templates,
			schemaName,
			context,
			{
				rootTemplateId,
				lookupCache,
			},
		);
	}
	private readonly policies: PresentationPolicyRegistry;

	constructor(policies?: PresentationPolicyRegistry) {
		this.policies = policies ?? new PresentationPolicyRegistry();
	}

	render(
		document: ClinicalDocumentReadModel,
		templates: readonly ClinicalProseTemplate[] = [],
		options: ClinicalDocumentRenderOptions = {},
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
					options,
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
