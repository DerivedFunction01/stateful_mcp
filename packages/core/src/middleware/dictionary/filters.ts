import type { ConceptFilterStore } from "./interfaces";
import type { ConceptFilter } from "./types";

export class InMemoryConceptFilterStore implements ConceptFilterStore {
	private filters = new Map<string, ConceptFilter>();

	async get(filterId: string): Promise<ConceptFilter | null> {
		return this.filters.get(filterId) ?? null;
	}
	async listByConcept(conceptId: string): Promise<ConceptFilter[]> {
		return [...this.filters.values()].filter((f) => f.conceptId === conceptId);
	}
	async listByRole(roleName: string): Promise<ConceptFilter[]> {
		return [...this.filters.values()].filter((f) => f.roleName === roleName);
	}
	async listForConceptRole(
		conceptId: string,
		roleName: string,
	): Promise<ConceptFilter[]> {
		return [...this.filters.values()].filter(
			(f) => f.conceptId === conceptId && f.roleName === roleName,
		);
	}
	async set(filter: ConceptFilter): Promise<void> {
		this.filters.set(filter.filterId, filter);
	}
	async delete(filterId: string): Promise<void> {
		this.filters.delete(filterId);
	}
}

/** Applies blacklist precedence and preserves legacy unrestricted behavior. */
export function isConceptAllowed(
	filters: ConceptFilter[],
	roleName?: string,
): boolean {
	const active = filters.filter(
		(f) => f.active !== false && (!roleName || f.roleName === roleName),
	);
	if (active.length === 0) return true;
	if (active.some((f) => f.policy === "blacklist")) return false;
	return active.some((f) => f.policy === "whitelist");
}
