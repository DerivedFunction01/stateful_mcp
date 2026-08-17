import type { OwnerScope } from "../../config/types";
import type {
	ConceptStore,
	ExpressionSearchRequest,
	PersistentExpressionStore,
} from "./interfaces";
import type {
	Concept,
	ConceptRelation,
	CustomExpression,
	Namespace,
	RelatedConceptResult,
	TraversalDirection,
} from "./types";

export type CacheEvictionPolicy =
	| "lru"
	| "mru"
	| "lfu"
	| "fifo"
	| "ttl"
	| "none";

export interface ConceptCacheOptions {
	/** Maximum number of entries in the in-memory cache (default: 1000) */
	readonly maxEntries?: number;
	/** Time-to-live in milliseconds for cached entries (default: 5 minutes / 300,000ms. 0 = no expiration) */
	readonly ttlMs?: number;
	/** Eviction policy when maxEntries is reached (default: "lru") */
	readonly policy?: CacheEvictionPolicy;
	/** Optional generic storage backend */
	readonly storageBackend?: unknown;
}

interface CacheNode<V> {
	key: string;
	value: V;
	createdAt: number;
	lastAccessedAt: number;
	accessCount: number;
	expiresAt?: number;
	prev?: CacheNode<V>;
	next?: CacheNode<V>;
}

/**
 * High-performance in-memory cache supporting LRU, MRU, LFU, FIFO, and TTL eviction policies.
 */
export class MemoryCache<V> {
	private readonly maxEntries: number;
	private readonly ttlMs: number;
	private readonly policy: CacheEvictionPolicy;
	private readonly map = new Map<string, CacheNode<V>>();
	private head?: CacheNode<V>;
	private tail?: CacheNode<V>;

	constructor(options: ConceptCacheOptions = {}) {
		this.maxEntries = Math.max(1, options.maxEntries ?? 1000);
		this.ttlMs = Math.max(0, options.ttlMs ?? 300000);
		this.policy = options.policy ?? "lru";
	}

	get size(): number {
		return this.map.size;
	}

	get(key: string): V | undefined {
		const node = this.map.get(key);
		if (!node) return undefined;

		const now = Date.now();
		if (node.expiresAt !== undefined && now > node.expiresAt) {
			this.delete(key);
			return undefined;
		}

		node.lastAccessedAt = now;
		node.accessCount++;

		if (this.policy === "lru" || this.policy === "mru") {
			this.moveToHead(node);
		}

		return node.value;
	}

	set(key: string, value: V, customTtlMs?: number): void {
		const now = Date.now();
		const effectiveTtl = customTtlMs ?? this.ttlMs;
		const expiresAt = effectiveTtl > 0 ? now + effectiveTtl : undefined;

		let node = this.map.get(key);
		if (node) {
			node.value = value;
			node.lastAccessedAt = now;
			node.expiresAt = expiresAt;
			node.accessCount++;
			if (this.policy === "lru" || this.policy === "mru") {
				this.moveToHead(node);
			}
			return;
		}

		if (this.map.size >= this.maxEntries) {
			this.evict();
		}

		node = {
			key,
			value,
			createdAt: now,
			lastAccessedAt: now,
			accessCount: 1,
			expiresAt,
		};

		this.map.set(key, node);
		this.attachToHead(node);
	}

	has(key: string): boolean {
		return this.get(key) !== undefined;
	}

	delete(key: string): boolean {
		const node = this.map.get(key);
		if (!node) return false;

		this.detach(node);
		this.map.delete(key);
		return true;
	}

	deletePrefix(prefix: string): void {
		for (const key of Array.from(this.map.keys())) {
			if (key.startsWith(prefix)) {
				this.delete(key);
			}
		}
	}

	clear(): void {
		this.map.clear();
		this.head = undefined;
		this.tail = undefined;
	}

	private moveToHead(node: CacheNode<V>): void {
		if (node === this.head) return;
		this.detach(node);
		this.attachToHead(node);
	}

	private attachToHead(node: CacheNode<V>): void {
		node.prev = undefined;
		node.next = this.head;
		if (this.head) {
			this.head.prev = node;
		}
		this.head = node;
		if (!this.tail) {
			this.tail = node;
		}
	}

	private detach(node: CacheNode<V>): void {
		if (node.prev) {
			node.prev.next = node.next;
		} else if (this.head === node) {
			this.head = node.next;
		}

		if (node.next) {
			node.next.prev = node.prev;
		} else if (this.tail === node) {
			this.tail = node.prev;
		}

		node.prev = undefined;
		node.next = undefined;
	}

	private evict(): void {
		if (this.map.size === 0) return;

		if (this.policy === "mru") {
			// Evict most recently accessed (head)
			if (this.head) {
				this.delete(this.head.key);
			}
			return;
		}

		if (this.policy === "lfu") {
			// Evict least frequently used
			let minNode: CacheNode<V> | undefined;
			for (const node of this.map.values()) {
				if (!minNode || node.accessCount < minNode.accessCount) {
					minNode = node;
				}
			}
			if (minNode) {
				this.delete(minNode.key);
			}
			return;
		}

		// Default: LRU or FIFO (evict tail)
		if (this.tail) {
			this.delete(this.tail.key);
		}
	}
}

/**
 * Transparent memoized decorator for ConceptStore.
 * Provides LRU/TTL caching, single-flight request coalescing, and lazy in-memory re-computation.
 */
export class MemoizedConceptStore implements ConceptStore {
	private readonly conceptCache: MemoryCache<Concept | null>;
	private readonly searchCache: MemoryCache<Concept[]>;
	private readonly relationCache: MemoryCache<ConceptRelation[]>;
	private readonly inFlightLookups = new Map<string, Promise<Concept | null>>();
	private readonly inFlightSearches = new Map<string, Promise<Concept[]>>();

	constructor(
		private readonly underlyingStore: ConceptStore,
		options: ConceptCacheOptions = {},
	) {
		this.conceptCache = new MemoryCache<Concept | null>(options);
		this.searchCache = new MemoryCache<Concept[]>(options);
		this.relationCache = new MemoryCache<ConceptRelation[]>(options);
	}

	async getById(id: string): Promise<Concept | null> {
		const cached = this.conceptCache.get(id);
		if (cached !== undefined) {
			return cached;
		}

		// Single-flight in-flight request coalescing
		let promise = this.inFlightLookups.get(id);
		if (!promise) {
			promise = this.underlyingStore.getById(id).then((concept) => {
				this.conceptCache.set(id, concept);
				this.inFlightLookups.delete(id);
				return concept;
			});
			this.inFlightLookups.set(id, promise);
		}

		return promise;
	}

	async getByIds(ids: string[]): Promise<Concept[]> {
		if (this.underlyingStore.getByIds) {
			const missingIds: string[] = [];
			const results: Concept[] = [];

			for (const id of ids) {
				const cached = this.conceptCache.get(id);
				if (cached) {
					results.push(cached);
				} else {
					missingIds.push(id);
				}
			}

			if (missingIds.length > 0) {
				const fetched = await this.underlyingStore.getByIds(missingIds);
				for (const concept of fetched) {
					this.conceptCache.set(concept.id, concept);
					results.push(concept);
				}
			}

			return results;
		}

		// Fallback to concurrent getById
		const concepts = await Promise.all(ids.map((id) => this.getById(id)));
		return concepts.filter((c): c is Concept => c !== null);
	}

	async search(
		query: string,
		namespaceCode?: string,
		limit?: number,
		roleName?: string,
	): Promise<Concept[]> {
		const searchKey = `${query}::${namespaceCode ?? ""}::${limit ?? ""}::${roleName ?? ""}`;
		const cached = this.searchCache.get(searchKey);
		if (cached !== undefined) {
			return cached;
		}

		let promise = this.inFlightSearches.get(searchKey);
		if (!promise) {
			promise = this.underlyingStore
				.search(query, namespaceCode, limit, roleName)
				.then((results) => {
					this.searchCache.set(searchKey, results);
					this.inFlightSearches.delete(searchKey);
					return results;
				});
			this.inFlightSearches.set(searchKey, promise);
		}

		return promise;
	}

	async listNamespaces(): Promise<Namespace[]> {
		return this.underlyingStore.listNamespaces();
	}

	async addConcept(concept: Concept): Promise<void> {
		await this.underlyingStore.addConcept(concept);
		this.conceptCache.set(concept.id, concept);
		this.searchCache.clear(); // Invalidate search index cache
	}

	async addNamespace(namespace: Namespace): Promise<void> {
		await this.underlyingStore.addNamespace(namespace);
	}

	async addRelation(relation: ConceptRelation): Promise<void> {
		if (this.underlyingStore.addRelation) {
			await this.underlyingStore.addRelation(relation);
			this.relationCache.deletePrefix(`${relation.conceptId}::`);
			this.relationCache.deletePrefix(`${relation.linkedId}::`);
		}
	}

	async getRelations(
		conceptId: string,
		direction?: TraversalDirection,
	): Promise<ConceptRelation[]> {
		if (!this.underlyingStore.getRelations) return [];
		const key = `${conceptId}::${direction ?? "all"}`;
		const cached = this.relationCache.get(key);
		if (cached !== undefined) {
			return cached;
		}

		const results = await this.underlyingStore.getRelations(
			conceptId,
			direction,
		);
		this.relationCache.set(key, results);
		return results;
	}

	async getRelatedConcepts(
		conceptId: string,
		direction?: TraversalDirection,
		maxDepth?: number,
		useCache?: boolean,
	): Promise<RelatedConceptResult[]> {
		if (!this.underlyingStore.getRelatedConcepts) return [];
		return this.underlyingStore.getRelatedConcepts(
			conceptId,
			direction,
			maxDepth,
			useCache,
		);
	}

	async invalidateRelationCache(conceptId?: string): Promise<void> {
		if (conceptId) {
			this.relationCache.deletePrefix(`${conceptId}::`);
		} else {
			this.relationCache.clear();
		}
		if (this.underlyingStore.invalidateRelationCache) {
			await this.underlyingStore.invalidateRelationCache(conceptId);
		}
	}

	async load(): Promise<void> {
		if (
			"load" in this.underlyingStore &&
			typeof this.underlyingStore.load === "function"
		) {
			await this.underlyingStore.load();
		}
		this.conceptCache.clear();
		this.searchCache.clear();
		this.relationCache.clear();
	}

	async save(): Promise<void> {
		if (
			"save" in this.underlyingStore &&
			typeof this.underlyingStore.save === "function"
		) {
			await this.underlyingStore.save();
		}
	}
}

/**
 * Transparent memoized decorator for PersistentExpressionStore.
 */
export class MemoizedExpressionStore implements PersistentExpressionStore {
	private readonly expressionCache: MemoryCache<CustomExpression | null>;
	private readonly listCache: MemoryCache<CustomExpression[]>;
	private readonly inFlightLookups = new Map<
		string,
		Promise<CustomExpression | null>
	>();

	constructor(
		private readonly underlyingStore: PersistentExpressionStore,
		options: ConceptCacheOptions = {},
	) {
		this.expressionCache = new MemoryCache<CustomExpression | null>(options);
		this.listCache = new MemoryCache<CustomExpression[]>(options);
	}

	async getById(id: string): Promise<CustomExpression | null> {
		const cached = this.expressionCache.get(id);
		if (cached !== undefined) {
			return cached;
		}

		let promise = this.inFlightLookups.get(id);
		if (!promise) {
			promise = this.underlyingStore.getById(id).then((expr) => {
				this.expressionCache.set(id, expr);
				this.inFlightLookups.delete(id);
				return expr;
			});
			this.inFlightLookups.set(id, promise);
		}

		return promise;
	}

	async list(
		scope: OwnerScope,
		includeGlobal?: boolean,
	): Promise<CustomExpression[]> {
		const key = `${scope.level}::${scope.level === "user" ? scope.userId : "global"}::${includeGlobal ?? true}`;
		const cached = this.listCache.get(key);
		if (cached !== undefined) {
			return cached;
		}

		const results = await this.underlyingStore.list(scope, includeGlobal);
		this.listCache.set(key, results);
		return results;
	}

	async searchCandidates(
		request: ExpressionSearchRequest,
	): Promise<CustomExpression[]> {
		if (this.underlyingStore.searchCandidates) {
			return this.underlyingStore.searchCandidates(request);
		}
		return [];
	}

	async save(expression: CustomExpression, scope: OwnerScope): Promise<void> {
		await this.underlyingStore.save(expression, scope);
		this.expressionCache.set(expression.id, expression);
		this.listCache.clear();
	}

	async delete(id: string, scope: OwnerScope): Promise<void> {
		await this.underlyingStore.delete(id, scope);
		this.expressionCache.delete(id);
		this.listCache.clear();
	}

	async load(): Promise<void> {
		if (
			"load" in this.underlyingStore &&
			typeof this.underlyingStore.load === "function"
		) {
			await this.underlyingStore.load();
		}
		this.expressionCache.clear();
		this.listCache.clear();
	}

	async flush(): Promise<void> {
		if (
			"flush" in this.underlyingStore &&
			typeof this.underlyingStore.flush === "function"
		) {
			await this.underlyingStore.flush();
		}
	}
}

/**
 * Factory helper to wrap any ConceptStore with the memoization decorator.
 */
export function createMemoizedConceptStore(
	underlyingStore: ConceptStore,
	options: ConceptCacheOptions = {},
): MemoizedConceptStore {
	return new MemoizedConceptStore(underlyingStore, options);
}

/**
 * Factory helper to wrap any PersistentExpressionStore with the memoization decorator.
 */
export function createMemoizedExpressionStore(
	underlyingStore: PersistentExpressionStore,
	options: ConceptCacheOptions = {},
): MemoizedExpressionStore {
	return new MemoizedExpressionStore(underlyingStore, options);
}
