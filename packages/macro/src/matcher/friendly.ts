import type { MessageParam } from "@stateful-mcp/macro-protocol";
import type { MacroSpec } from "../contracts/macro";
import {
	type MacroArgumentForm,
	type MacroArgumentMatch,
	type MacroAuthoringTemplatePart,
	spansOverlap,
} from "../contracts/matching";

export interface TemplateValidationIssue {
	code:
		| "UNKNOWN_TEMPLATE_ARGUMENT"
		| "DUPLICATE_TEMPLATE_OCCURRENCE"
		| "INVALID_TEMPLATE_FORM";
	/** Structured message key; preferred over `message` when present. */
	messageKey: string;
	messageParams?: Readonly<Record<string, MessageParam>>;
	argumentId?: string;
}

export function validateMacroTemplates(
	spec: MacroSpec,
): TemplateValidationIssue[] {
	const issues: TemplateValidationIssue[] = [];
	const argumentIds = new Set(
		spec.arguments.map((argument) => argument.argumentId),
	);
	for (const form of definitionForms(spec)) {
		const slots = form.template.parts.filter(isSlot);
		if (!slots.length) {
			issues.push({
				code: "INVALID_TEMPLATE_FORM",
				messageKey: "templates.validation.invalidForm",
				messageParams: { formId: form.formId },
			});
			continue;
		}
		const occurrences = new Set<string>();
		for (const slot of slots) {
			if (!argumentIds.has(slot.argumentId)) {
				issues.push({
					code: "UNKNOWN_TEMPLATE_ARGUMENT",
					argumentId: slot.argumentId,
					messageKey: "templates.validation.unknownArgument",
					messageParams: { argumentId: slot.argumentId },
				});
			}
			const key = `${slot.argumentId}:${slot.occurrence}`;
			if (occurrences.has(key)) {
				issues.push({
					code: "DUPLICATE_TEMPLATE_OCCURRENCE",
					argumentId: slot.argumentId,
					messageKey: "templates.validation.duplicateOccurrence",
					messageParams: { key },
				});
			}
			occurrences.add(key);
		}
	}
	return issues;
}

export function resolveMacroArgumentMatches(
	matches: readonly MacroArgumentMatch[],
	spec: MacroSpec,
): MacroArgumentMatch[] {
	const forms = new Map(
		definitionForms(spec).map((form) => [form.formId, form]),
	);
	return [...matches]
		.sort((left, right) => {
			const leftForm = left.formId ? forms.get(left.formId) : undefined;
			const rightForm = right.formId ? forms.get(right.formId) : undefined;
			return (
				(right.priority ?? rightForm?.precedence ?? 0) -
					(left.priority ?? leftForm?.precedence ?? 0) ||
				right.extraction.end -
					right.extraction.start -
					(left.extraction.end - left.extraction.start) ||
				(left.formId ?? "").localeCompare(right.formId ?? "")
			);
		})
		.filter(
			(candidate, index, all) =>
				!all
					.slice(0, index)
					.some(
						(winner) =>
							spansOverlap(candidate.extraction, winner.extraction) &&
							!isCompatible(candidate, winner, forms),
					),
		)
		.sort((left, right) => left.extraction.start - right.extraction.start);
}

function definitionForms(spec: MacroSpec): MacroArgumentForm[] {
	const forms = spec.arguments.flatMap((argument) => argument.forms ?? []);
	for (const [index, template] of (spec.authoringTemplates ?? []).entries()) {
		const slot = template.parts.find(
			(part): part is Extract<MacroAuthoringTemplatePart, { kind: "slot" }> =>
				part.kind === "slot",
		);
		if (slot) {
			forms.push({
				formId: `template:${index}:${slot.argumentId}:${slot.occurrence}`,
				kind: "friendly",
				argumentId: slot.argumentId,
				template,
			});
		}
	}
	return forms;
}

function isSlot(
	part: MacroAuthoringTemplatePart,
): part is Extract<MacroAuthoringTemplatePart, { kind: "slot" }> {
	return part.kind === "slot";
}

function isCompatible(
	left: MacroArgumentMatch,
	right: MacroArgumentMatch,
	forms: Map<string, MacroArgumentForm>,
): boolean {
	const leftForm = left.formId ? forms.get(left.formId) : undefined;
	const rightForm = right.formId ? forms.get(right.formId) : undefined;
	return Boolean(
		leftForm?.compatibility?.includes(right.formId ?? "") ||
			rightForm?.compatibility?.includes(left.formId ?? ""),
	);
}
