import {
	evaluateTranslationCondition,
	executePipeline,
	formatTranslationValue,
	joinTranslationList,
	normalizeTranslationInput,
	resolveTranslationPath,
} from "@stateful-mcp/core";
import type {
	V2ClinicalProseTemplate,
	V2OutputProseSlot,
	V2SlotCondition,
} from "./template-types";

export class V2TemplateRenderer {
	static renderTemplate(
		template: V2ClinicalProseTemplate,
		context: unknown,
		templates: readonly V2ClinicalProseTemplate[],
		visited = new Set<string>(),
	): string {
		if (visited.has(template.templateId))
			throw new Error(
				`Circular template dependency detected at '${template.templateId}'`,
			);
		const nextVisited = new Set(visited).add(template.templateId);
		let output = template.templateText;
		for (const token of V2TemplateRenderer.extractTokens(output)) {
			const slot = template.slots[token];
			const replacement = slot
				? V2TemplateRenderer.renderSlot(slot, context, templates, nextVisited)
				: "";
			output = output.replace(`{${token}}`, replacement);
		}
		return output;
	}

	static renderObject(
		value: Record<string, unknown>,
		templates: readonly V2ClinicalProseTemplate[],
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
			? V2TemplateRenderer.renderTemplate(template, value, templates)
			: null;
	}

	private static renderSlot(
		slot: V2OutputProseSlot,
		context: unknown,
		templates: readonly V2ClinicalProseTemplate[],
		visited: Set<string>,
	): string {
		const value = resolveTranslationPath(context, slot.sourcePath);
		if (
			value === undefined ||
			value === null ||
			(slot.conditions &&
				!V2TemplateRenderer.condition(slot.conditions, context))
		)
			return slot.fallback ?? "";
		const delegateId =
			(slot.conditionalDelegates ?? []).find((delegate) =>
				V2TemplateRenderer.condition(delegate.conditions, value),
			)?.delegateTemplateId ?? slot.defaultDelegateTemplateId;
		let rendered = delegateId
			? templates.find((template) => template.templateId === delegateId)
				? Array.isArray(value)
					? joinTranslationList(
							value.map((item) =>
								V2TemplateRenderer.renderTemplate(
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
					: V2TemplateRenderer.renderTemplate(
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
		condition: V2SlotCondition,
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
