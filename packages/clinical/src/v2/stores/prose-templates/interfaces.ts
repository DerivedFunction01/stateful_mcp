import type { ClinicalProseTemplate } from "../../../store/interfaces";
import type { Position } from "../../../store/reference/auto-complete/interfaces";

export interface ClinicalProseTemplateStore {
	get(
		schema: string,
		position: Position,
		conceptId?: string,
		workspaceId?: string,
	): Promise<ClinicalProseTemplate | null>;
	getById(templateId: string): Promise<ClinicalProseTemplate | null>;
	listBySchema(
		schema: string,
		position?: Position,
	): Promise<ClinicalProseTemplate[]>;
	list(): Promise<ClinicalProseTemplate[]>;
	set(template: ClinicalProseTemplate): Promise<void>;
	delete(templateId: string): Promise<void>;
}
