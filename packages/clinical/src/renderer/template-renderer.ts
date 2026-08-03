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
} from "../store/interfaces";

export class TemplateRenderer {
	static renderTemplate(
		template: ClinicalProseTemplate,
		context: any,
		templates: ClinicalProseTemplate[],
		visited: Set<string>,
	): string {
		if (visited.has(template.templateId)) {
			throw new Error(
				`Circular template dependency detected: ${Array.from(visited).join(" -> ")} -> ${template.templateId}`,
			);
		}
		visited.add(template.templateId);

		let output = template.templateText;
		const tokens = TemplateRenderer.extractTokens(output);

		for (const token of tokens) {
			const slot = template.slots[token];
			if (!slot) {
				output = output.replace(`{${token}}`, "");
				continue;
			}

			if (
				slot.conditions &&
				!TemplateRenderer.evaluateCondition(slot.conditions, context)
			) {
				output = output.replace(`{${token}}`, slot.fallback || "");
				continue;
			}

			const resolvedData = TemplateRenderer.resolvePath(
				context,
				slot.sourcePath,
			);
			if (resolvedData === undefined || resolvedData === null) {
				output = output.replace(`{${token}}`, slot.fallback || "");
				continue;
			}

			let slotValue = "";
			const delegateId = TemplateRenderer.resolveDelegate(slot, resolvedData);

			if (delegateId) {
				const childTemplate = templates.find(
					(t) => t.templateId === delegateId,
				);
				if (!childTemplate) {
					slotValue = slot.fallback || "";
				} else {
					if (Array.isArray(resolvedData)) {
						const parts: string[] = [];
						for (const item of resolvedData) {
							parts.push(
								TemplateRenderer.renderTemplate(
									childTemplate,
									item,
									templates,
									new Set(visited),
								),
							);
						}
						slotValue = TemplateRenderer.joinList(parts, slot.listOptions);
					} else {
						slotValue = TemplateRenderer.renderTemplate(
							childTemplate,
							resolvedData,
							templates,
							new Set(visited),
						);
					}
				}
			} else {
				if (Array.isArray(resolvedData)) {
					const parts = resolvedData.map((item) =>
						TemplateRenderer.formatValue(item, slot.format),
					);
					slotValue = TemplateRenderer.joinList(parts, slot.listOptions);
				} else {
					slotValue = TemplateRenderer.formatValue(resolvedData, slot.format);
				}
			}

			if (slot.transform?.pipeline) {
				const transformResult = executePipeline(
					slot.transform.pipeline,
					normalizeTranslationInput(resolvedData),
					{},
				);
				slotValue = String(transformResult ?? "");
			}

			output = output.replace(`{${token}}`, slotValue);
		}

		visited.delete(template.templateId);
		return output;
	}

	static renderObject(
		obj: any,
		templates: ClinicalProseTemplate[],
		targetSchema?: string,
	): string | null {
		const schema = targetSchema ?? obj.targetSchema;
		if (!schema) return null;

		const matched = templates.filter((t) => t.targetSchema === schema);
		if (matched.length === 0) return null;

		const sorted = [...matched].sort((a, b) => {
			if (a.targetConceptId && !b.targetConceptId) return -1;
			if (!a.targetConceptId && b.targetConceptId) return 1;
			return 0;
		});

		const template = sorted[0];
		if (!template) return null;

		return TemplateRenderer.renderTemplate(
			template,
			obj,
			templates,
			new Set<string>(),
		);
	}

	static extractTokens(text: string): string[] {
		const matches = text.match(/\{([a-zA-Z0-9_\-.]+)\}/g);
		if (!matches) return [];
		return matches.map((m) => m.slice(1, -1));
	}

	static resolvePath(context: any, path: string): any {
		return resolveTranslationPath(context, path);
	}

	static evaluateCondition(condition: SlotCondition, context: any): boolean {
		return evaluateTranslationCondition(condition.pipeline, context);
	}

	static resolveDelegate(
		slot: OutputProseSlot,
		resolvedData: any,
	): string | undefined {
		if (slot.conditionalDelegates) {
			for (const delegate of slot.conditionalDelegates) {
				if (
					TemplateRenderer.evaluateCondition(delegate.conditions, resolvedData)
				) {
					return delegate.delegateTemplateId;
				}
			}
		}
		return slot.defaultDelegateTemplateId;
	}

	static formatValue(value: any, format?: string): string {
		return formatTranslationValue(value, format);
	}

	static joinList(
		items: string[],
		options?: { delimiter: string; lastDelimiter?: string },
	): string {
		return joinTranslationList(items, options);
	}
}
