import type { ClinicalProseTemplate } from "../store/interfaces";

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
