import type { V2ClinicalProseTemplate } from "./template-types";

export class V2TemplateWalker {
	static validate(templates: readonly V2ClinicalProseTemplate[], maxDepth = 10): void {
		const byId = new Map(templates.map((template) => [template.templateId, template]));
		const visiting = new Set<string>();
		const visited = new Set<string>();
		const walk = (id: string, depth: number) => {
			if (depth > maxDepth) throw new Error(`Template nesting depth exceeds ${maxDepth} at '${id}'`);
			if (visiting.has(id)) throw new Error(`Circular template dependency detected at '${id}'`);
			if (visited.has(id)) return;
			const template = byId.get(id);
			if (!template) return;
			visiting.add(id);
			for (const slot of Object.values(template.slots)) {
				if (slot.defaultDelegateTemplateId) walk(slot.defaultDelegateTemplateId, depth + 1);
				for (const delegate of slot.conditionalDelegates ?? []) walk(delegate.delegateTemplateId, depth + 1);
			}
			visiting.delete(id);
			visited.add(id);
		};
		for (const template of templates) walk(template.templateId, 1);
	}
}
