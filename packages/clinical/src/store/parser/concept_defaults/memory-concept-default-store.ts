import type { ParserConceptDefault } from "../interfaces";
import type { ParserConceptDefaultStore } from "./interfaces";

export class MemoryConceptDefaultStore implements ParserConceptDefaultStore {
	private readonly records = new Map<string, ParserConceptDefault>();

	private key(anchorConceptId: string, targetSchema: string): string {
		return `${anchorConceptId}::${targetSchema}`;
	}

	async get(
		anchorConceptId: string,
		targetSchema: string,
	): Promise<ParserConceptDefault | null> {
		return this.records.get(this.key(anchorConceptId, targetSchema)) ?? null;
	}

	async list(): Promise<ParserConceptDefault[]> {
		return Array.from(this.records.values()).map((r) => ({ ...r }));
	}

	async listBySchema(targetSchema: string): Promise<ParserConceptDefault[]> {
		return Array.from(this.records.values())
			.filter((r) => r.targetSchema === targetSchema)
			.map((r) => ({ ...r }));
	}

	async set(record: ParserConceptDefault): Promise<void> {
		this.records.set(this.key(record.anchorConceptId, record.targetSchema), {
			...record,
		});
	}

	async delete(anchorConceptId: string, targetSchema: string): Promise<void> {
		this.records.delete(this.key(anchorConceptId, targetSchema));
	}
}
