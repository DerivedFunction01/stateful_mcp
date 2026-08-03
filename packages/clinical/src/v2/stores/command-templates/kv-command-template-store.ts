import type { KvBackend } from "@stateful-mcp/core";
import type { CommandTemplate, CommandTemplateStore } from "./interfaces";
import { assertValidCommandTemplate } from "./validation";

export class KvCommandTemplateStore implements CommandTemplateStore {
	private readonly prefix = "command-template:";

	constructor(private readonly backend: KvBackend) {}

	async getById(templateId: string): Promise<CommandTemplate | null> {
		const data = await this.backend.load();
		const value = data[this.prefix + templateId];
		return (value as CommandTemplate | undefined) ?? null;
	}

	async list(context?: {
		macroId?: string;
		workspaceId?: string;
		specialtyId?: string;
		stage?: CommandTemplate["stage"];
	}): Promise<CommandTemplate[]> {
		const data = await this.backend.load();
		return Object.entries(data)
			.filter(([key]) => key.startsWith(this.prefix))
			.map(([, value]) => value as CommandTemplate)
			.filter((template) => template.active !== false)
			.filter(
				(template) => !context?.macroId || template.macroId === context.macroId,
			)
			.filter(
				(template) =>
					!context?.workspaceId || template.workspaceId === context.workspaceId,
			)
			.filter(
				(template) =>
					!context?.specialtyId || template.specialtyId === context.specialtyId,
			)
			.filter((template) => !context?.stage || template.stage === context.stage)
			.sort((left, right) =>
				(left.templateName ?? left.templateId).localeCompare(
					right.templateName ?? right.templateId,
				),
			);
	}

	async set(template: CommandTemplate): Promise<void> {
		assertValidCommandTemplate(template);
		await this.backend.set(this.prefix + template.templateId, template);
		await this.backend.save();
	}

	async delete(templateId: string): Promise<void> {
		await this.backend.delete(this.prefix + templateId);
		await this.backend.save();
	}
}
