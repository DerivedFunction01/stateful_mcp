import {
	evaluateTranslationCondition,
	executePipeline,
	formatTranslationValue,
	joinTranslationList,
	normalizeTranslationInput,
	resolveTranslationPath,
} from "@stateful-mcp/core";
import type {
	ClinicalProseTemplate,
	OutputProseSlot,
	SlotCondition,
} from "./template-types";

export class TemplateRenderer {
	static renderTemplate(
		template: ClinicalProseTemplate,
		context: unknown,
		templates: readonly ClinicalProseTemplate[],
		visited = new Set<string>(),
	): string {
		if (visited.has(template.templateId))
			throw new Error(
				`Circular template dependency detected at '${template.templateId}'`,
			);
		const nextVisited = new Set(visited).add(template.templateId);
		let output = template.templateText;
		for (const token of TemplateRenderer.extractTokens(output)) {
			const slot = template.slots[token];
			const replacement = slot
				? TemplateRenderer.renderSlot(slot, context, templates, nextVisited)
				: "";
			output = output.replace(`{${token}}`, replacement);
		}
		return output;
	}

	static renderObject(
		value: Record<string, unknown>,
		templates: readonly ClinicalProseTemplate[],
		targetSchema: string,
	): string | null {
		const candidates = templates
			.filter((template) => template.targetSchema === targetSchema)
			.sort(
				(left, right) =>
					Number(Boolean(right.targetConceptId)) -
					Number(Boolean(left.targetConceptId)),
			);
		const template = candidates[0];
		return template
			? TemplateRenderer.renderTemplate(template, value, templates)
			: null;
	}

	private static renderSlot(
		slot: OutputProseSlot,
		context: unknown,
		templates: readonly ClinicalProseTemplate[],
		visited: Set<string>,
	): string {
		const value = resolveTranslationPath(context, slot.sourcePath);
		if (
			value === undefined ||
			value === null ||
			(slot.conditions && !TemplateRenderer.condition(slot.conditions, context))
		)
			return slot.fallback ?? "";
		const delegateId =
			(slot.conditionalDelegates ?? []).find((delegate) =>
				TemplateRenderer.condition(delegate.conditions, value),
			)?.delegateTemplateId ?? slot.defaultDelegateTemplateId;
		let rendered = delegateId
			? templates.find((template) => template.templateId === delegateId)
				? Array.isArray(value)
					? joinTranslationList(
							value.map((item) =>
								TemplateRenderer.renderTemplate(
									templates.find(
										(template) => template.templateId === delegateId,
									)!,
									item,
									templates,
									visited,
								),
							),
							slot.listOptions,
						)
					: TemplateRenderer.renderTemplate(
							templates.find((template) => template.templateId === delegateId)!,
							value,
							templates,
							visited,
						)
				: (slot.fallback ?? "")
			: Array.isArray(value)
				? joinTranslationList(
						value.map((item) => formatTranslationValue(item, slot.format)),
						slot.listOptions,
					)
				: formatTranslationValue(value, slot.format);
		if (slot.transform?.pipeline)
			rendered = String(
				executePipeline(
					slot.transform.pipeline,
					normalizeTranslationInput(value),
					{},
				) ?? "",
			);
		return rendered;
	}

	private static condition(
		condition: SlotCondition,
		context: unknown,
	): boolean {
		return evaluateTranslationCondition(condition.pipeline, context);
	}
	private static extractTokens(text: string): string[] {
		return [...text.matchAll(/\{([a-zA-Z0-9_.-]+)\}/g)].map(
			(match) => match[1]!,
		);
	}
}
