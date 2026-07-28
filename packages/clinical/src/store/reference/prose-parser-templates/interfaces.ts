import type { ProseTemplate } from "../../../schemas/prose-template";

export interface ProseParserTemplateStore {
get(templateId: string): Promise<ProseTemplate | null>;
listBySchema(targetSchema: string): Promise<ProseTemplate[]>;
listAll(): Promise<ProseTemplate[]>;
set(template: ProseTemplate): Promise<void>;
delete(templateId: string): Promise<void>;
}
