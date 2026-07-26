import type { ClinicalProseTemplate } from "../../parser/interfaces";
import type { ClinicalProseTemplateStore } from "./interfaces";

export class MemoryClinicalProseTemplateStore
	implements ClinicalProseTemplateStore
{
	private readonly templates = new Map<string, ClinicalProseTemplate>();

	async get(
		schema: string,
		position: string,
		conceptId?: string,
		workspaceId?: string,
	): Promise<ClinicalProseTemplate | null> {
		for (const t of this.templates.values()) {
			if (t.targetSchema !== schema || t.slotPosition !== position) continue;
			if (conceptId && t.targetConceptId !== conceptId) continue;
			if (!conceptId && t.targetConceptId != null) continue;
			if (workspaceId && t.workspaceId !== workspaceId) continue;
			return { ...t };
		}
		return null;
	}

	async list(): Promise<ClinicalProseTemplate[]> {
		return Array.from(this.templates.values()).map((t) => ({ ...t }));
	}

	async set(template: ClinicalProseTemplate): Promise<void> {
		this.templates.set(template.templateId, { ...template });
	}

	async delete(templateId: string): Promise<void> {
		this.templates.delete(templateId);
	}
}
