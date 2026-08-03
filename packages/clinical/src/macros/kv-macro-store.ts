import type { KvBackend } from "@stateful-mcp/core";
import type { MacroStore, V2MacroDefinition } from "./macro-definition";

export class KvMacroStore implements MacroStore {
	constructor(
		private readonly backend: KvBackend,
		private readonly prefix = "v2:macro:",
	) {}

	async get(
		macroName: string,
		context?: { personnelId?: string; profileId?: string },
	): Promise<V2MacroDefinition | null> {
		return (
			(await this.list(context)).find(
				(macro) => macro.macroName === macroName,
			) ?? null
		);
	}

	async list(
		context: { personnelId?: string; profileId?: string } = {},
	): Promise<V2MacroDefinition[]> {
		const data = await this.backend.load();
		return Object.entries(data)
			.filter(([key]) => key.startsWith(this.prefix))
			.map(([, value]) => parse(value))
			.filter((macro) => macro.active && macro.status === "published")
			.filter(
				(macro) =>
					!macro.personnelId ||
					!context.personnelId ||
					macro.personnelId === context.personnelId,
			)
			.filter(
				(macro) =>
					!macro.profileId ||
					!context.profileId ||
					macro.profileId === context.profileId,
			)
			.sort(
				(left, right) =>
					left.macroName.localeCompare(right.macroName) ||
					right.version - left.version,
			);
	}

	async set(macro: V2MacroDefinition): Promise<void> {
		await this.backend.set(
			`${this.prefix}${macro.macroId}`,
			JSON.stringify(macro),
		);
		await this.backend.save();
	}

	async delete(macroId: string): Promise<void> {
		await this.backend.delete(`${this.prefix}${macroId}`);
		await this.backend.save();
	}
}

function parse(value: unknown): V2MacroDefinition {
	return typeof value === "string"
		? (JSON.parse(value) as V2MacroDefinition)
		: (value as V2MacroDefinition);
}
