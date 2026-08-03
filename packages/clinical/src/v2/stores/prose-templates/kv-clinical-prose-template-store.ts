import type { KvBackend } from "@stateful-mcp/core";
import type { ClinicalProseTemplate } from "../../parser/interfaces";
import type { Position } from "../../../store/reference/auto-complete/interfaces";
import type { ClinicalProseTemplateStore } from "./interfaces";

export class KvClinicalProseTemplateStore
	implements ClinicalProseTemplateStore
{
	private readonly prefix = "clinicalProseTemplate:";

	constructor(private readonly backend: KvBackend) {}

	private key(template: {
		targetSchema: string;
		targetConceptId?: string;
		workspaceId?: string;
		slotPosition: string;
	}): string {
		const cId = template.targetConceptId ?? "base";
		const wId = template.workspaceId ?? "global";
		return `${this.prefix}${template.targetSchema}:${cId}:${wId}:${template.slotPosition}`;
	}

	async get(
		schema: string,
		position: Position,
		conceptId?: string,
		workspaceId?: string,
	): Promise<ClinicalProseTemplate | null> {
		const data = await this.backend.load();

		const entries = Object.values(data) as ClinicalProseTemplate[];
		for (const t of entries) {
			if (t.targetSchema !== schema || t.slotPosition !== position) continue;
			if (conceptId && t.targetConceptId !== conceptId) continue;
			if (!conceptId && t.targetConceptId != null) continue;
			if (workspaceId && t.workspaceId !== workspaceId) continue;
			return t;
		}
		return null;
	}

	async getById(templateId: string): Promise<ClinicalProseTemplate | null> {
		const data = await this.backend.load();
		const entries = Object.values(data) as ClinicalProseTemplate[];
		for (const t of entries) {
			if (t.templateId === templateId) return t;
		}
		return null;
	}

	async listBySchema(
		schema: string,
		position?: Position,
	): Promise<ClinicalProseTemplate[]> {
		const data = await this.backend.load();
		const entries = Object.values(data) as ClinicalProseTemplate[];
		return entries.filter((t) => {
			if (t.targetSchema !== schema) return false;
			if (position && t.slotPosition !== position) return false;
			return true;
		});
	}

	async list(): Promise<ClinicalProseTemplate[]> {
		const data = await this.backend.load();
		return Object.entries(data)
			.filter(([k]) => k.startsWith(this.prefix))
			.map(([, v]) => v as ClinicalProseTemplate);
	}

	async set(template: ClinicalProseTemplate): Promise<void> {
		await this.backend.set(this.key(template), template);
		await this.backend.save();
	}

	async delete(templateId: string): Promise<void> {
		const data = await this.backend.load();
		const key = Object.keys(data).find((k) => {
			const v = data[k] as ClinicalProseTemplate | undefined;
			return v?.templateId === templateId;
		});
		if (key) {
			await this.backend.delete(key);
			await this.backend.save();
		}
	}
}
