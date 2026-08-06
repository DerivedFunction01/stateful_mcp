import type { ClinicalProseTemplate } from "./template-types";

export class TemplateWalker {
	static diagnostics(
		templates: readonly ClinicalProseTemplate[],
		maxDepth = 10,
	): string[] {
		const diagnostics: string[] = [];
		const byId = new Map(
			templates.map((template) => [template.templateId, template]),
		);
		const visiting = new Set<string>();
		const visited = new Set<string>();
		const walk = (id: string, depth: number) => {
			if (depth > maxDepth) {
				diagnostics.push(
					`Template nesting depth exceeds ${maxDepth} at '${id}'`,
				);
				return;
			}
			if (visiting.has(id)) {
				diagnostics.push(`Circular template dependency detected at '${id}'`);
				return;
			}
			if (visited.has(id)) return;
			const template = byId.get(id);
			if (!template) {
				diagnostics.push(`Missing template delegate '${id}'`);
				return;
			}
			visiting.add(id);
			for (const [slotId, slot] of Object.entries(template.slots)) {
				if (slot.defaultDelegateTemplateId)
					walk(slot.defaultDelegateTemplateId, depth + 1);
				for (const delegate of slot.conditionalDelegates ?? [])
					walk(delegate.delegateTemplateId, depth + 1);
				if (
					slot.contract?.slotKey &&
					template.kind === "root" &&
					!slot.contract.slotKey.startsWith("soap.")
				)
					diagnostics.push(
						`Root slot '${template.templateId}.${slotId}' should use a SOAP slot key`,
					);
			}
			visiting.delete(id);
			visited.add(id);
		};
		for (const template of templates.filter(
			(candidate) => candidate.kind === "root",
		))
			walk(template.templateId, 1);
		return diagnostics;
	}

	static validate(
		templates: readonly ClinicalProseTemplate[],
		maxDepth = 10,
	): void {
		const diagnostics = TemplateWalker.diagnostics(templates, maxDepth);
		if (diagnostics.length) throw new Error(diagnostics.join("; "));
	}
}
