import { describe, expect, test } from "bun:test";
import type { OwnerScope } from "../src/config/types";
import type {
	ConceptStore,
	PersistentExpressionStore,
} from "../src/middleware/dictionary/interfaces";
import {
	createMemoizedConceptStore,
	createMemoizedExpressionStore,
	MemoryCache,
} from "../src/middleware/dictionary/memoized-store";
import type {
	Concept,
	ConceptRelation,
	CustomExpression,
	Namespace,
} from "../src/middleware/dictionary/types";

class MockConceptStore implements ConceptStore {
	public getByIdCalls = 0;
	public searchCalls = 0;
	public getRelationsCalls = 0;
	public concepts = new Map<string, Concept>();
	public relations: ConceptRelation[] = [];

	async getById(id: string): Promise<Concept | null> {
		this.getByIdCalls++;
		return this.concepts.get(id) ?? null;
	}

	async search(query: string): Promise<Concept[]> {
		this.searchCalls++;
		return Array.from(this.concepts.values()).filter((c) =>
			c.display.toLowerCase().includes(query.toLowerCase()),
		);
	}

	async listNamespaces(): Promise<Namespace[]> {
		return [];
	}

	async addConcept(concept: Concept): Promise<void> {
		this.concepts.set(concept.id, concept);
	}

	async addNamespace(): Promise<void> {}

	async addRelation(relation: ConceptRelation): Promise<void> {
		this.relations.push(relation);
	}

	async getRelations(conceptId: string): Promise<ConceptRelation[]> {
		this.getRelationsCalls++;
		return this.relations.filter(
			(r) => r.conceptId === conceptId || r.linkedId === conceptId,
		);
	}
}

class MockExpressionStore implements PersistentExpressionStore {
	public getByIdCalls = 0;
	public listCalls = 0;
	public expressions = new Map<string, CustomExpression>();

	async getById(id: string): Promise<CustomExpression | null> {
		this.getByIdCalls++;
		return this.expressions.get(id) ?? null;
	}

	async list(): Promise<CustomExpression[]> {
		this.listCalls++;
		return Array.from(this.expressions.values());
	}

	async save(expression: CustomExpression): Promise<void> {
		this.expressions.set(expression.id, expression);
	}

	async delete(id: string): Promise<void> {
		this.expressions.delete(id);
	}
}

describe("Standalone Memoized Concept & Expression Store Middleware (memoized-store.ts)", () => {
	const SCOPE: OwnerScope = { level: "user", userId: "user-1" };

	describe("1. Cache Hits & Avoided Store Queries", () => {
		test("caches concept lookups in L1 memory and avoids redundant store hits", async () => {
			const rawStore = new MockConceptStore();
			await rawStore.addConcept({
				id: "rxnorm::866514",
				namespaceCode: "rxnorm",
				standardCode: "866514",
				display: "Metformin 500mg",
				active: true,
			});

			const cachedStore = createMemoizedConceptStore(rawStore);

			// First read -> Store hit
			const first = await cachedStore.getById("rxnorm::866514");
			expect(first?.display).toBe("Metformin 500mg");
			expect(rawStore.getByIdCalls).toBe(1);

			// Second read -> Cache hit (0 store hits)
			const second = await cachedStore.getById("rxnorm::866514");
			expect(second?.display).toBe("Metformin 500mg");
			expect(rawStore.getByIdCalls).toBe(1);

			// Third read -> Cache hit
			const third = await cachedStore.getById("rxnorm::866514");
			expect(third?.display).toBe("Metformin 500mg");
			expect(rawStore.getByIdCalls).toBe(1);
		});

		test("caches concept search queries", async () => {
			const rawStore = new MockConceptStore();
			await rawStore.addConcept({
				id: "inv::1",
				namespaceCode: "inv",
				standardCode: "1",
				display: "Nitrile Gloves",
				active: true,
			});

			const cachedStore = createMemoizedConceptStore(rawStore);

			const res1 = await cachedStore.search("gloves");
			expect(res1).toHaveLength(1);
			expect(rawStore.searchCalls).toBe(1);

			const res2 = await cachedStore.search("gloves");
			expect(res2).toHaveLength(1);
			expect(rawStore.searchCalls).toBe(1);
		});
	});

	describe("2. Auto-Expiration & Lazy Recalculation", () => {
		test("automatically expires entries past TTL and recalculates from store on next read", async () => {
			const rawStore = new MockConceptStore();
			await rawStore.addConcept({
				id: "c1",
				namespaceCode: "ns",
				standardCode: "c1",
				display: "Version 1",
				active: true,
			});

			// Short 50ms TTL
			const cachedStore = createMemoizedConceptStore(rawStore, { ttlMs: 50 });

			const first = await cachedStore.getById("c1");
			expect(first?.display).toBe("Version 1");
			expect(rawStore.getByIdCalls).toBe(1);

			// Update in underlying store directly without cache notification
			rawStore.concepts.set("c1", {
				id: "c1",
				namespaceCode: "ns",
				standardCode: "c1",
				display: "Version 2",
				active: true,
			});

			// Immediate read before TTL expires -> Returns cached Version 1
			const early = await cachedStore.getById("c1");
			expect(early?.display).toBe("Version 1");
			expect(rawStore.getByIdCalls).toBe(1);

			// Wait 60ms for TTL to expire
			await new Promise((resolve) => setTimeout(resolve, 60));

			// Next read past TTL -> Lazy re-computation returns fresh Version 2
			const fresh = await cachedStore.getById("c1");
			expect(fresh?.display).toBe("Version 2");
			expect(rawStore.getByIdCalls).toBe(2);
		});
	});

	describe("3. Eviction Policies (LRU, MRU, LFU)", () => {
		test("LRU policy evicts least recently accessed entry when capacity reached", () => {
			const cache = new MemoryCache<string>({ maxEntries: 2, policy: "lru" });

			cache.set("a", "alpha");
			cache.set("b", "beta");

			// Access 'a' to make it most recently used
			expect(cache.get("a")).toBe("alpha");

			// Insert 'c' -> 'b' is least recently used and must be evicted
			cache.set("c", "gamma");

			expect(cache.get("a")).toBe("alpha");
			expect(cache.get("c")).toBe("gamma");
			expect(cache.get("b")).toBeUndefined();
		});

		test("MRU policy evicts most recently accessed entry when capacity reached", () => {
			const cache = new MemoryCache<string>({ maxEntries: 2, policy: "mru" });

			cache.set("a", "alpha");
			cache.set("b", "beta");

			// Access 'b' to make it most recently used
			expect(cache.get("b")).toBe("beta");

			// Insert 'c' -> 'b' (most recently used) is evicted
			cache.set("c", "gamma");

			expect(cache.get("a")).toBe("alpha");
			expect(cache.get("c")).toBe("gamma");
			expect(cache.get("b")).toBeUndefined();
		});

		test("LFU policy evicts least frequently used entry", () => {
			const cache = new MemoryCache<string>({ maxEntries: 2, policy: "lfu" });

			cache.set("a", "alpha");
			cache.set("b", "beta");

			// Access 'a' 5 times
			for (let i = 0; i < 5; i++) {
				cache.get("a");
			}
			// Access 'b' only 1 time
			cache.get("b");

			// Insert 'c' -> 'b' (accessCount 2) has lower frequency than 'a' (accessCount 6)
			cache.set("c", "gamma");

			expect(cache.get("a")).toBe("alpha");
			expect(cache.get("c")).toBe("gamma");
			expect(cache.get("b")).toBeUndefined();
		});
	});

	describe("4. Mutation Invalidation & Relations", () => {
		test("addConcept updates cache and clears search cache", async () => {
			const rawStore = new MockConceptStore();
			const cachedStore = createMemoizedConceptStore(rawStore);

			await cachedStore.addConcept({
				id: "c1",
				namespaceCode: "ns",
				standardCode: "c1",
				display: "Initial",
				active: true,
			});

			expect(cachedStore.getById("c1")).resolves.toMatchObject({
				display: "Initial",
			});

			// Update via store method
			await cachedStore.addConcept({
				id: "c1",
				namespaceCode: "ns",
				standardCode: "c1",
				display: "Updated",
				active: true,
			});

			expect(cachedStore.getById("c1")).resolves.toMatchObject({
				display: "Updated",
			});
		});

		test("addRelation invalidates relation caches for participating concepts", async () => {
			const rawStore = new MockConceptStore();
			const cachedStore = createMemoizedConceptStore(rawStore);

			await cachedStore.addRelation({
				id: "r1",
				conceptId: "box",
				linkedId: "single",
				relationshipType: "EQUIVALENT",
				active: true,
			});

			// Read relations -> store hit
			const rels1 = await cachedStore.getRelations("box");
			expect(rels1).toHaveLength(1);
			expect(rawStore.getRelationsCalls).toBe(1);

			// Read relations again -> cache hit
			const rels2 = await cachedStore.getRelations("box");
			expect(rels2).toHaveLength(1);
			expect(rawStore.getRelationsCalls).toBe(1);

			// Add new relation -> invalidates 'box' cache
			await cachedStore.addRelation({
				id: "r2",
				conceptId: "box",
				linkedId: "case",
				relationshipType: "WIDER_THAN",
				active: true,
			});

			const rels3 = await cachedStore.getRelations("box");
			expect(rels3).toHaveLength(2);
			expect(rawStore.getRelationsCalls).toBe(2);
		});
	});

	describe("5. In-Flight Single-Flight Request Coalescing", () => {
		test("deduplicates concurrent in-flight lookups for the same concept into a single store execution", async () => {
			class DelayedConceptStore extends MockConceptStore {
				override async getById(id: string): Promise<Concept | null> {
					this.getByIdCalls++;
					await new Promise((resolve) => setTimeout(resolve, 30));
					return this.concepts.get(id) ?? null;
				}
			}

			const rawStore = new DelayedConceptStore();
			await rawStore.addConcept({
				id: "c_shared",
				namespaceCode: "ns",
				standardCode: "c_shared",
				display: "Shared Concept",
				active: true,
			});

			const cachedStore = createMemoizedConceptStore(rawStore);

			// Fire 20 concurrent requests for the same uncached ID simultaneously
			const promises = Array.from({ length: 20 }, () =>
				cachedStore.getById("c_shared"),
			);
			const results = await Promise.all(promises);

			expect(results).toHaveLength(20);
			for (const res of results) {
				expect(res?.display).toBe("Shared Concept");
			}

			// Single-flight coalescing ensures store was queried exactly ONCE
			expect(rawStore.getByIdCalls).toBe(1);
		});
	});

	describe("6. MemoizedExpressionStore", () => {
		test("caches expression lookups and invalidates on save/delete", async () => {
			const rawStore = new MockExpressionStore();
			const cachedStore = createMemoizedExpressionStore(rawStore);

			const expr: CustomExpression = {
				id: "e1",
				term: "T-Shirt",
				lookupTerm: "t-shirt",
				regexPattern: "t-shirt",
				isCaseInsensitive: true,
				priorityWeight: 1,
				active: true,
				context: {},
			};

			await cachedStore.save(expr, SCOPE);

			const first = await cachedStore.getById("e1");
			expect(first?.term).toBe("T-Shirt");
			expect(rawStore.getByIdCalls).toBe(0); // already in cache from save

			const list1 = await cachedStore.list(SCOPE);
			expect(list1).toHaveLength(1);
			expect(rawStore.listCalls).toBe(1);

			// Second list read -> Cache hit
			const list2 = await cachedStore.list(SCOPE);
			expect(list2).toHaveLength(1);
			expect(rawStore.listCalls).toBe(1);

			// Delete -> Invalidates cache
			await cachedStore.delete("e1", SCOPE);
			const afterDelete = await cachedStore.getById("e1");
			expect(afterDelete).toBeNull();
		});
	});
});
