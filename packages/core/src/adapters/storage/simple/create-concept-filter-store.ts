import type { ConceptFilterStore } from "../../../middleware/dictionary/interfaces";
import type { ConceptFilter } from "../../../middleware/dictionary/types";
import type { KvBackend } from "./kv-backend";

const prefix = "dict-concept-filter:";

export class KvConceptFilterStore implements ConceptFilterStore {
	constructor(private backend: KvBackend) {}

	async get(filterId: string): Promise<ConceptFilter | null> {
		const value = await this.backend.getPersistentState(
			`${prefix}${filterId}`,
			{ level: "global" },
		);
		return value ? normalize(value) : null;
	}

	async listByConcept(conceptId: string): Promise<ConceptFilter[]> {
		return (await this.all()).filter(
			(filter) => filter.conceptId === conceptId,
		);
	}

	async listByRole(roleName: string): Promise<ConceptFilter[]> {
		return (await this.all()).filter((filter) => filter.roleName === roleName);
	}

	async listForConceptRole(
		conceptId: string,
		roleName: string,
	): Promise<ConceptFilter[]> {
		return (await this.all()).filter(
			(filter) =>
				filter.conceptId === conceptId && filter.roleName === roleName,
		);
	}

	async listForConceptRoleBatch(
		conceptIds: string[],
		roleName: string,
	): Promise<Map<string, ConceptFilter[]>> {
		const wanted = new Set(conceptIds);
		const result = new Map<string, ConceptFilter[]>();
		for (const filter of await this.all()) {
			if (!wanted.has(filter.conceptId) || filter.roleName !== roleName)
				continue;
			result.set(filter.conceptId, [
				...(result.get(filter.conceptId) ?? []),
				filter,
			]);
		}
		return result;
	}

	async set(filter: ConceptFilter): Promise<void> {
		await this.backend.setPersistentState(
			`${prefix}${filter.filterId}`,
			{ level: "global" },
			filter,
		);
		await this.backend.save();
	}

	async delete(filterId: string): Promise<void> {
		await this.backend.deletePersistentState(`${prefix}${filterId}`, {
			level: "global",
		});
		await this.backend.save();
	}

	private async all(): Promise<ConceptFilter[]> {
		const records: ConceptFilter[] = [];
		for await (const value of this.backend.scanPersistentStates(
			{ level: "global" },
			true,
		)) {
			if (typeof value.filterId === "string" && value.filterId.length > 0)
				records.push(normalize(value));
		}
		return records;
	}
}

export async function createConceptFilterStore(
	backend: KvBackend,
): Promise<KvConceptFilterStore> {
	await backend.load();
	return new KvConceptFilterStore(backend);
}

function normalize(value: Record<string, any>): ConceptFilter {
	return {
		filterId: String(value.filterId),
		conceptId: String(value.conceptId),
		policy: value.policy === "blacklist" ? "blacklist" : "whitelist",
		roleName: String(value.roleName),
		active: value.active !== false,
	};
}
