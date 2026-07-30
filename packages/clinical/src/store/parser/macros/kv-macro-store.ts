import type { KvBackend } from "@stateful-mcp/core";
import type { ParserMacro, ParserMacroStore } from "../../interfaces";

export class KvParserMacroStore implements ParserMacroStore {
	private readonly prefix = "macro:";

	constructor(private readonly backend: KvBackend) {}

	async get(macroName: string): Promise<ParserMacro | null> {
		const data = await this.backend.load();
		const value = data[this.prefix + macroName];
		return (value as ParserMacro | undefined) ?? null;
	}

	async list(): Promise<ParserMacro[]> {
		const data = await this.backend.load();
		return Object.entries(data)
			.filter(([k]) => k.startsWith(this.prefix))
			.map(([, v]) => v as ParserMacro);
	}

	async set(macro: ParserMacro): Promise<void> {
		await this.backend.set(this.prefix + macro.macroName, macro);
		await this.backend.save();
	}

	async delete(macroId: string): Promise<void> {
		const data = await this.backend.load();
		for (const [key, value] of Object.entries(data)) {
			if (
				key.startsWith(this.prefix) &&
				(value as ParserMacro).macroId === macroId
			) {
				await this.backend.delete(key);
				await this.backend.save();
				break;
			}
		}
	}
}
