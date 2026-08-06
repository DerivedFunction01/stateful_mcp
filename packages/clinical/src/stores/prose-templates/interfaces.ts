import type {
	ClinicalProseTemplate,
	SoapSection,
} from "../../rendering/template-types";

export interface ProseTemplateListContext {
	kind?: "root" | "component";
	section?: SoapSection;
	slotKey?: string;
	targetSchema?: string;
	workspaceId?: string;
	specialtyId?: string;
	activeOnly?: boolean;
}

export interface ClinicalProseTemplateStore {
	get(
		schema: string,
		position: ClinicalProseTemplate["slotPosition"],
		conceptId?: string,
		workspaceId?: string,
	): Promise<ClinicalProseTemplate | null>;
	getById(templateId: string): Promise<ClinicalProseTemplate | null>;
	listBySchema(
		schema: string,
		position?: ClinicalProseTemplate["slotPosition"],
	): Promise<ClinicalProseTemplate[]>;
	list(context?: ProseTemplateListContext): Promise<ClinicalProseTemplate[]>;
	listRoots(
		context?: Omit<ProseTemplateListContext, "kind">,
	): Promise<ClinicalProseTemplate[]>;
	listComponents(
		context: Omit<ProseTemplateListContext, "kind"> & { slotKey: string },
	): Promise<ClinicalProseTemplate[]>;
	set(template: ClinicalProseTemplate): Promise<void>;
	delete(templateId: string): Promise<void>;
}
