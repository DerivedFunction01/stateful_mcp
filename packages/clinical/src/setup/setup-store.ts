import type { KvBackend } from "@stateful-mcp/core/adapters/storage/simple/kv-backend";
import type { SetupSourceDocument } from "./setup-types";

export interface SetupSourceStore {
	get(sourceId: string): Promise<SetupSourceDocument | null>;
	set(source: SetupSourceDocument): Promise<void>;
	delete(sourceId: string): Promise<void>;
	list(): Promise<SetupSourceDocument[]>;
}

export class MemorySetupSourceStore implements SetupSourceStore {
	private readonly values = new Map<string, SetupSourceDocument>();

	async get(sourceId: string): Promise<SetupSourceDocument | null> {
		return this.values.get(sourceId) ?? null;
	}

	async set(source: SetupSourceDocument): Promise<void> {
		this.values.set(source.sourceId, structuredClone(source));
	}

	async delete(sourceId: string): Promise<void> {
		this.values.delete(sourceId);
	}

	async list(): Promise<SetupSourceDocument[]> {
		return [...this.values.values()].map((source) => structuredClone(source));
	}
}

export class KvSetupSourceStore implements SetupSourceStore {
	private readonly prefix = "clinical-setup-source:";

	constructor(private readonly backend: KvBackend) {}

	async get(sourceId: string): Promise<SetupSourceDocument | null> {
		const value = await this.backend.getPersistentState(`${this.prefix}${sourceId}`, { level: "global" });
		return value as SetupSourceDocument | null;
	}

	async set(source: SetupSourceDocument): Promise<void> {
		await this.backend.setPersistentState(`${this.prefix}${source.sourceId}`, { level: "global" }, source);
		await this.backend.save();
	}

	async delete(sourceId: string): Promise<void> {
		await this.backend.deletePersistentState(`${this.prefix}${sourceId}`, { level: "global" });
		await this.backend.save();
	}

	async list(): Promise<SetupSourceDocument[]> {
		const values: SetupSourceDocument[] = [];
		for await (const value of this.backend.scanPersistentStates({ level: "global" }, true)) {
			if (typeof value.sourceId === "string" && value.sourceId.length > 0)
				values.push(value as SetupSourceDocument);
		}
		return values;
	}
}
