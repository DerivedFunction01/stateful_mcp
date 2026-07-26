import type { ClinicalProseTemplate } from "../../interfaces";

export interface ClinicalProseTemplateStore {
	get(
		schema: string,
		position: string,
		conceptId?: string,
		workspaceId?: string,
	): Promise<ClinicalProseTemplate | null>;
	list(): Promise<ClinicalProseTemplate[]>;
	set(template: ClinicalProseTemplate): Promise<void>;
	delete(templateId: string): Promise<void>;
}
