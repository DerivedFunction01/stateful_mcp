import type { KvBackend } from "@stateful-mcp/core";
import type { ParserCommandMacro, ParserCommandMacroStore } from "./interfaces";
import { normalizeParserCommandMacro } from "./validation";

export class KvParserCommandMacroStore implements ParserCommandMacroStore {
	private readonly prefix = "command-macro:";

	constructor(private readonly backend: KvBackend) {}

	async get(macroName: string, context?: { personnelId?: string; profileId?: string }): Promise<ParserCommandMacro | null> {
		const macros = await this.list(context);
		return macros.find((macro) => macro.macroName === macroName) ?? null;
	}

	async list(context?: { personnelId?: string; profileId?: string }): Promise<ParserCommandMacro[]> {
		const data = await this.backend.load();
		return Object.entries(data)
			.filter(([key]) => key.startsWith(this.prefix))
			.map(([, value]) => value as ParserCommandMacro)
			.filter((macro) => macro.active)
			.filter((macro) => !macro.personnelId || !context?.personnelId || macro.personnelId === context.personnelId)
			.filter((macro) => !macro.profileId || !context?.profileId || macro.profileId === context.profileId)
			.sort((a, b) => a.macroName.localeCompare(b.macroName));
	}

	async set(macro: ParserCommandMacro): Promise<void> {
		const normalized = normalizeParserCommandMacro(macro);
		await this.backend.set(this.prefix + normalized.macroId, normalized);
		await this.backend.save();
	}

	async delete(macroId: string): Promise<void> {
		await this.backend.delete(this.prefix + macroId);
		await this.backend.save();
	}
}
