import type { ClinicalProseTemplate } from "../../interfaces";

export interface ClinicalProseTemplateStore {
	get(
		schema: string,
		position: "opening" | "continuing" | "closing" | "full_paragraph",
		conceptId?: string,
		workspaceId?: string,
	): Promise<ClinicalProseTemplate | null>;
	getById(templateId: string): Promise<ClinicalProseTemplate | null>;
	listBySchema(
		schema: string,
		position?: "opening" | "continuing" | "closing" | "full_paragraph",
	): Promise<ClinicalProseTemplate[]>;
	list(): Promise<ClinicalProseTemplate[]>;
	set(template: ClinicalProseTemplate): Promise<void>;
	delete(templateId: string): Promise<void>;
}
