import type { KvBackend } from "@stateful-mcp/core";
import type { ProseTemplate } from "../../../schemas/prose-template";
import type { ProseParserTemplateStore } from "./interfaces";

export class KvProseParserTemplateStore implements ProseParserTemplateStore {
	private readonly prefix = "proseParserTemplate:";

	constructor(private readonly backend: KvBackend) {}

	private key(templateId: string): string {
		return `${this.prefix}${templateId}`;
	}

	async get(templateId: string): Promise<ProseTemplate | null> {
		const data = await this.backend.load();
		const k = this.key(templateId);
		const val = data[k];
		return val ? (val as ProseTemplate) : null;
	}

	async listBySchema(targetSchema: string): Promise<ProseTemplate[]> {
		const data = await this.backend.load();
		return Object.entries(data)
			.filter(([k]) => k.startsWith(this.prefix))
			.map(([, v]) => v as ProseTemplate)
			.filter((t) => t.targetSchema === targetSchema);
	}

	async listAll(): Promise<ProseTemplate[]> {
		const data = await this.backend.load();
		return Object.entries(data)
			.filter(([k]) => k.startsWith(this.prefix))
			.map(([, v]) => v as ProseTemplate);
	}

	async set(template: ProseTemplate): Promise<void> {
		await this.backend.set(this.key(template.templateId), template);
		await this.backend.save();
	}

	async delete(templateId: string): Promise<void> {
		const k = this.key(templateId);
		await this.backend.delete(k);
		await this.backend.save();
	}
}
