import type { KvBackend } from "@stateful-mcp/core";
import type { ParserConceptDefault } from "../interfaces";
import type { ParserConceptDefaultStore } from "./interfaces";

export class KvConceptDefaultStore implements ParserConceptDefaultStore {
	private readonly prefix = "conceptDefault:";

	constructor(private readonly backend: KvBackend) {}

	private key(anchorConceptId: string, targetSchema: string): string {
		return `${this.prefix}${anchorConceptId}::${targetSchema}`;
	}

	async get(
		anchorConceptId: string,
		targetSchema: string,
	): Promise<ParserConceptDefault | null> {
		const data = await this.backend.load();
		const value = data[this.key(anchorConceptId, targetSchema)];
		return (value as ParserConceptDefault | undefined) ?? null;
	}

	async list(): Promise<ParserConceptDefault[]> {
		const data = await this.backend.load();
		return Object.entries(data)
			.filter(([k]) => k.startsWith(this.prefix))
			.map(([, v]) => v as ParserConceptDefault);
	}

	async listBySchema(targetSchema: string): Promise<ParserConceptDefault[]> {
		const all = await this.list();
		return all.filter((r) => r.targetSchema === targetSchema);
	}

	async set(record: ParserConceptDefault): Promise<void> {
		await this.backend.set(
			this.key(record.anchorConceptId, record.targetSchema),
			record,
		);
		await this.backend.save();
	}

	async delete(anchorConceptId: string, targetSchema: string): Promise<void> {
		await this.backend.delete(this.key(anchorConceptId, targetSchema));
		await this.backend.save();
	}
}
