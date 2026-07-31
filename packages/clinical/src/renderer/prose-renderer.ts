import type { SoapNote } from "../schemas/document";
import type { ClinicalProseTemplate } from "../store/interfaces";
import { TemplateRenderer } from "./template-renderer";

export class ProseRenderer {
	static render(note: SoapNote, templates: ClinicalProseTemplate[]): SoapNote {
		const resultNote = structuredClone(note);

		const hpiEvents =
			resultNote.subjective?.historyOfPresentIllness?.events || [];
		const hpiNarrative = ProseRenderer.renderSection(
			resultNote,
			hpiEvents,
			templates,
			"opening",
		);
		if (resultNote.subjective?.historyOfPresentIllness) {
			resultNote.subjective.historyOfPresentIllness.narrative =
				hpiNarrative || undefined;
		}

		const objectiveEvents = [
			...(resultNote.objective?.vitalSigns || []),
			...(resultNote.objective?.clinicalObservations || []),
		];
		const objNarrative = ProseRenderer.renderSection(
			resultNote,
			objectiveEvents,
			templates,
			"closing",
		);
		if (resultNote.objective) {
			resultNote.objective.narrative = objNarrative || undefined;
		}

		const assessmentEvents = resultNote.assessment?.differentialDiagnoses || [];
		const assessmentNarrative = ProseRenderer.renderSection(
			resultNote,
			assessmentEvents,
			templates,
			"closing",
		);
		if (resultNote.assessment) {
			resultNote.assessment.narrative =
				assessmentNarrative || undefined;
		}

		const planEvents = resultNote.plan?.prescriptions || [];
		const planNarrative = ProseRenderer.renderSection(
			resultNote,
			planEvents,
			templates,
			"full_paragraph",
		);
		if (resultNote.plan) {
			resultNote.plan.narrative = planNarrative || undefined;
		}

		return resultNote;
	}

	/**
	 * Renders a specific template against the given context scope.
	 * Delegates to TemplateRenderer for backward compatibility.
	 */
	static renderTemplate(
		template: ClinicalProseTemplate,
		context: any,
		templates: ClinicalProseTemplate[],
		visited: Set<string>,
	): string {
		return TemplateRenderer.renderTemplate(
			template,
			context,
			templates,
			visited,
		);
	}

	private static renderSection(
		rootNote: SoapNote,
		items: any[],
		templates: ClinicalProseTemplate[],
		position: "opening" | "continuing" | "closing" | "full_paragraph",
	): string {
		const matchedTemplates = templates.filter(
			(t) => t.slotPosition === position,
		);
		if (matchedTemplates.length === 0) return "";

		const sorted = [...matchedTemplates].sort((a, b) => {
			if (a.targetConceptId && !b.targetConceptId) return -1;
			if (!a.targetConceptId && b.targetConceptId) return 1;
			return 0;
		});

		const template = sorted[0];
		if (!template) return "";

		return TemplateRenderer.renderTemplate(
			template,
			rootNote,
			templates,
			new Set<string>(),
		);
	}
}

export { TemplateWalker } from "./template-walker";
