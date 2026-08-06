import type { KvBackend } from "@stateful-mcp/core";
import type { ClinicalProseTemplate } from "../../rendering/template-types";
import type {
	ClinicalProseTemplateStore,
	ProseTemplateListContext,
} from "./interfaces";

export class KvClinicalProseTemplateStore
	implements ClinicalProseTemplateStore
{
	private readonly prefix = "clinicalProseTemplate:";

	constructor(private readonly backend: KvBackend) {}

	private key(template: {
		templateId: string;
		kind: string;
		targetSchema: string;
	}): string {
		return `${this.prefix}${template.kind}:${template.targetSchema}:${template.templateId}`;
	}

	async get(
		schema: string,
		position: ClinicalProseTemplate["slotPosition"],
		conceptId?: string,
		workspaceId?: string,
	): Promise<ClinicalProseTemplate | null> {
		const data = await this.backend.load();

		const entries = Object.values(data) as ClinicalProseTemplate[];
		for (const t of entries) {
			if (
				t.targetSchema !== schema ||
				t.slotPosition !== position ||
				t.active === false
			)
				continue;
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
		position?: ClinicalProseTemplate["slotPosition"],
	): Promise<ClinicalProseTemplate[]> {
		const data = await this.backend.load();
		const entries = Object.values(data) as ClinicalProseTemplate[];
		return entries.filter((t) => {
			if (t.targetSchema !== schema) return false;
			if (position && t.slotPosition !== position) return false;
			return t.active !== false;
		});
	}

	async list(
		context: ProseTemplateListContext = {},
	): Promise<ClinicalProseTemplate[]> {
		const data = await this.backend.load();
		return Object.entries(data)
			.filter(([k]) => k.startsWith(this.prefix))
			.map(([, v]) => v as ClinicalProseTemplate)
			.filter(
				(template) =>
					(context.kind === undefined || template.kind === context.kind) &&
					(context.section === undefined ||
						template.section === context.section) &&
					(context.slotKey === undefined ||
						template.slotKey === context.slotKey) &&
					(context.targetSchema === undefined ||
						template.targetSchema === context.targetSchema) &&
					(context.workspaceId === undefined ||
						template.workspaceId === context.workspaceId) &&
					(context.specialtyId === undefined ||
						template.specialtyId === context.specialtyId) &&
					(!context.activeOnly || template.active !== false),
			);
	}

	async listRoots(context: Omit<ProseTemplateListContext, "kind"> = {}) {
		return this.list({ ...context, kind: "root", activeOnly: true });
	}

	async listComponents(
		context: Omit<ProseTemplateListContext, "kind"> & { slotKey: string },
	) {
		return this.list({ ...context, kind: "component", activeOnly: true });
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
