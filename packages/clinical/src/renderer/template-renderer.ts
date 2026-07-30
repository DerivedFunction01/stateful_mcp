import { executePipeline } from "@stateful-mcp/core/src/translation/pipeline";
import type { ClinicalProseTemplate, OutputProseSlot, SlotCondition } from "../store/interfaces";

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

			const resolvedData = TemplateRenderer.resolvePath(context, slot.sourcePath);
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
				const pipelineInput =
					typeof resolvedData === "object" && resolvedData !== null
						? resolvedData
						: { "": resolvedData };
				const transformResult = executePipeline(
					slot.transform.pipeline,
					pipelineInput,
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
		if (path === "$root" || path === "") return context;
		const parts = path.split(".");
		let current = context;
		for (const part of parts) {
			if (current === undefined || current === null) return undefined;
			const index = Number.parseInt(part, 10);
			if (!Number.isNaN(index)) {
				current = current[index];
			} else {
				current = current[part];
			}
		}
		return current;
	}

	static evaluateCondition(
		condition: SlotCondition,
		context: any,
	): boolean {
		const row =
			typeof context === "object" && context !== null
				? context
				: { "": context };
		const result = executePipeline(condition.pipeline, row, {});
		return Boolean(result);
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
		if (value === undefined || value === null) return "";
		if (!format) {
			return typeof value === "object" ? JSON.stringify(value) : String(value);
		}
		let output = format;
		const tokens = TemplateRenderer.extractTokens(format);
		for (const token of tokens) {
			const propVal = TemplateRenderer.resolvePath(value, token);
			output = output.replace(
				`{${token}}`,
				propVal !== undefined ? String(propVal) : "",
			);
		}
		return output;
	}

	static joinList(
		items: string[],
		options?: { delimiter: string; lastDelimiter?: string },
	): string {
		const cleanItems = items.filter((x) => x.trim().length > 0);
		if (cleanItems.length === 0) return "";
		if (cleanItems.length === 1) return cleanItems[0]!;
		if (!options) return cleanItems.join(", ");
		if (options.lastDelimiter && cleanItems.length > 1) {
			const last = cleanItems.pop();
			return `${cleanItems.join(options.delimiter)}${options.lastDelimiter}${last}`;
		}
		return cleanItems.join(options.delimiter);
	}
}