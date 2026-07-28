import type { KvBackend } from "@stateful-mcp/core";
import type { ConceptFieldRule, ConceptFieldStore } from "./interfaces";

export class KvConceptFieldStore implements ConceptFieldStore {
	private readonly prefix = "conceptField:";

	constructor(private readonly backend: KvBackend) {}

	private key(
		conceptId: string,
		targetSchema: string,
		fieldPath: string,
	): string {
		return `${this.prefix}${conceptId}::${targetSchema}::${fieldPath}`;
	}

	async get(
		conceptId: string,
		targetSchema: string,
		fieldPath: string,
	): Promise<ConceptFieldRule | null> {
		const data = await this.backend.load();
		const value = data[this.key(conceptId, targetSchema, fieldPath)];
		return (value as ConceptFieldRule | undefined) ?? null;
	}

	async list(): Promise<ConceptFieldRule[]> {
		const data = await this.backend.load();
		return Object.entries(data)
			.filter(([k]) => k.startsWith(this.prefix))
			.map(([, v]) => v as ConceptFieldRule);
	}

	async listBySchema(targetSchema: string): Promise<ConceptFieldRule[]> {
		const all = await this.list();
		return all.filter((r) => r.targetSchema === targetSchema);
	}

	async listByConcept(conceptId: string): Promise<ConceptFieldRule[]> {
		const all = await this.list();
		return all.filter((r) => r.conceptId === conceptId);
	}

	async set(rule: ConceptFieldRule): Promise<void> {
		await this.backend.set(
			this.key(rule.conceptId, rule.targetSchema, rule.fieldPath),
			rule,
		);
		await this.backend.save();
	}

	async delete(
		conceptId: string,
		targetSchema: string,
		fieldPath: string,
	): Promise<void> {
		await this.backend.delete(this.key(conceptId, targetSchema, fieldPath));
		await this.backend.save();
	}
}
