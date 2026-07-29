import { executePipeline } from "@stateful-mcp/core/src/translation/pipeline";
import type { SoapNote } from "../schemas/document";
import type {
	ClinicalProseTemplate,
	OutputProseSlot,
	SlotCondition,
} from "../store/interfaces";

export class ProseRenderer {
	/**
	 * Renders all narrative fields of a SoapNote using the provided templates.
	 * Explicitly maps slot positions to their target SoapNote narrative fields.
	 */
	static render(note: SoapNote, templates: ClinicalProseTemplate[]): SoapNote {
		const resultNote = JSON.parse(JSON.stringify(note)) as SoapNote;

		// 1. subjective.historyOfPresentIllness.narrative (opening)
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

		// 2. objective.narrative (closing)
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

		// 3. assessment.clinicalImpression (closing)
		const assessmentEvents = resultNote.assessment?.differentialDiagnoses || [];
		const assessmentNarrative = ProseRenderer.renderSection(
			resultNote,
			assessmentEvents,
			templates,
			"closing",
		);
		if (resultNote.assessment) {
			resultNote.assessment.clinicalImpression =
				assessmentNarrative || undefined;
		}

		// 4. plan.narrative (full_paragraph)
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
	 * Renders a list of items into a combined narrative string using templates matching a slot position.
	 */
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

		// Find the best template (prioritizing conceptId specific templates over generic ones)
		const sorted = [...matchedTemplates].sort((a, b) => {
			if (a.targetConceptId && !b.targetConceptId) return -1;
			if (!a.targetConceptId && b.targetConceptId) return 1;
			return 0;
		});

		const template = sorted[0];
		if (!template) return "";

		return ProseRenderer.renderTemplate(
			template,
			rootNote,
			templates,
			new Set<string>(),
		);
	}

	/**
	 * Renders a specific template against the given context scope.
	 */
	public static renderTemplate(
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
		const tokens = ProseRenderer.extractTokens(output);

		for (const token of tokens) {
			const slot = template.slots[token];
			if (!slot) {
				// No slot config: replace placeholder with empty string as per no-assumptions rule
				output = output.replace(`{${token}}`, "");
				continue;
			}

			// 1. Evaluate slot-level conditions
			if (
				slot.conditions &&
				!ProseRenderer.evaluateCondition(slot.conditions, context)
			) {
				output = output.replace(`{${token}}`, slot.fallback || "");
				continue;
			}

			// 2. Resolve source data path
			const resolvedData = ProseRenderer.resolvePath(context, slot.sourcePath);
			if (resolvedData === undefined || resolvedData === null) {
				output = output.replace(`{${token}}`, slot.fallback || "");
				continue;
			}

			// 3. Delegate to sub-templates if defined
			let slotValue = "";
			const delegateId = ProseRenderer.resolveDelegate(slot, resolvedData);

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
								ProseRenderer.renderTemplate(
									childTemplate,
									item,
									templates,
									new Set(visited),
								),
							);
						}
						slotValue = ProseRenderer.joinList(parts, slot.listOptions);
					} else {
						slotValue = ProseRenderer.renderTemplate(
							childTemplate,
							resolvedData,
							templates,
							new Set(visited),
						);
					}
				}
			} else {
				// 4. Inline rendering (no delegation)
				if (Array.isArray(resolvedData)) {
					const parts = resolvedData.map((item) =>
						ProseRenderer.formatValue(item, slot.format),
					);
					slotValue = ProseRenderer.joinList(parts, slot.listOptions);
				} else {
					slotValue = ProseRenderer.formatValue(resolvedData, slot.format);
				}
			}

			// 5. Apply transform pipeline if configured
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

	private static extractTokens(text: string): string[] {
		const matches = text.match(/\{([a-zA-Z0-9_\-.]+)\}/g);
		if (!matches) return [];
		return matches.map((m) => m.slice(1, -1));
	}

	private static resolvePath(context: any, path: string): any {
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

	private static evaluateCondition(
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

	private static resolveDelegate(
		slot: OutputProseSlot,
		resolvedData: any,
	): string | undefined {
		if (slot.conditionalDelegates) {
			for (const delegate of slot.conditionalDelegates) {
				if (
					ProseRenderer.evaluateCondition(delegate.conditions, resolvedData)
				) {
					return delegate.delegateTemplateId;
				}
			}
		}
		return slot.defaultDelegateTemplateId;
	}

	private static formatValue(value: any, format?: string): string {
		if (value === undefined || value === null) return "";
		if (!format) {
			return typeof value === "object" ? JSON.stringify(value) : String(value);
		}
		// Interpolate properties from value into the format string
		let output = format;
		const tokens = ProseRenderer.extractTokens(format);
		for (const token of tokens) {
			const propVal = ProseRenderer.resolvePath(value, token);
			output = output.replace(
				`{${token}}`,
				propVal !== undefined ? String(propVal) : "",
			);
		}
		return output;
	}

	private static joinList(
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

export class TemplateWalker {
	static validateTemplateCycles(templates: ClinicalProseTemplate[]): void {
		const visited = new Set<string>();
		const stack = new Set<string>();

		function dfs(tId: string): void {
			if (stack.has(tId)) {
				throw new Error(`Object schema cycle detected: ... → ${tId}`);
			}
			if (visited.has(tId)) return;
			visited.add(tId);
			stack.add(tId);

			const template = templates.find((t) => t.templateId === tId);
			if (template?.slots) {
				for (const slot of Object.values(template.slots)) {
					if (slot.defaultDelegateTemplateId) {
						dfs(slot.defaultDelegateTemplateId);
					}
					if (slot.conditionalDelegates) {
						for (const delegate of slot.conditionalDelegates) {
							dfs(delegate.delegateTemplateId);
						}
					}
				}
			}
			stack.delete(tId);
		}

		for (const t of templates) {
			dfs(t.templateId);
		}
	}

	static validateTemplateDepth(
		templates: ClinicalProseTemplate[],
		maxDepth = 10,
	): void {
		function getDepth(tId: string, depth: number): number {
			if (depth > maxDepth) {
				throw new Error(
					`Object schema: nesting depth exceeds ${maxDepth} at "${tId}"`,
				);
			}
			const template = templates.find((t) => t.templateId === tId);
			if (!template?.slots) return depth;
			let maxChildDepth = depth;
			for (const slot of Object.values(template.slots)) {
				if (slot.defaultDelegateTemplateId) {
					maxChildDepth = Math.max(
						maxChildDepth,
						getDepth(slot.defaultDelegateTemplateId, depth + 1),
					);
				}
				if (slot.conditionalDelegates) {
					for (const delegate of slot.conditionalDelegates) {
						maxChildDepth = Math.max(
							maxChildDepth,
							getDepth(delegate.delegateTemplateId, depth + 1),
						);
					}
				}
			}
			return maxChildDepth;
		}

		for (const t of templates) {
			getDepth(t.templateId, 1);
		}
	}
}
