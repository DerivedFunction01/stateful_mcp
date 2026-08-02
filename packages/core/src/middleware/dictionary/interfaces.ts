import type { OwnerScope } from "../../config/types";
import type {
	Concept,
	ConceptFilter,
	ConceptRelation,
	CustomExpression,
	Namespace,
	RelatedConceptResult,
	TraversalDirection,
} from "./types";

export interface DictionarySource {
	lookup(
		request: ExpressionSearchRequest,
	): Promise<import("./types").DictionaryCandidate[]>;
}

export interface DictionarySyncState {
	projectionId: string;
	sourceId: string;
	domain: string;
	cursor?: string;
	status: "idle" | "applied" | "error";
	updatedAt: string;
	errorMessage?: string;
}

export interface ExpressionSearchRequest {
	query?: string;
	lookupTerm?: string;
	lookupPrefix?: string;
	targetAssignments?: string[];
	activeOnly?: boolean;
	scope?: OwnerScope;
	limit?: number;
}

export interface ConceptFilterStore {
	get(filterId: string): Promise<ConceptFilter | null>;
	listByConcept(conceptId: string): Promise<ConceptFilter[]>;
	listByRole(roleName: string): Promise<ConceptFilter[]>;
	listForConceptRole(
		conceptId: string,
		roleName: string,
	): Promise<ConceptFilter[]>;
	set(filter: ConceptFilter): Promise<void>;
	delete(filterId: string): Promise<void>;
}

export interface ConceptStore {
	/**
	 * Search concepts by term, matching ID, code, display, or description.
	 */
	search(
		query: string,
		namespaceCode?: string,
		limit?: number,
	): Promise<Concept[]>;

	/**
	 * Retrieve a single concept by ID.
	 */
	getById(id: string): Promise<Concept | null>;

	/**
	 * List all namespaces.
	 */
	listNamespaces(): Promise<Namespace[]>;

	/**
	 * Optional helper to add concepts (for setup and compliance testing).
	 */
	addConcept(concept: Concept): Promise<void>;

	/**
	 * Optional helper to add namespaces.
	 */
	addNamespace(namespace: Namespace): Promise<void>;

	/**
	 * Add or register a concept relationship link.
	 */
	addRelation?(relation: ConceptRelation): Promise<void>;

	/**
	 * Retrieve raw relations for a concept given a traversal direction.
	 */
	getRelations?(
		conceptId: string,
		direction?: TraversalDirection,
	): Promise<ConceptRelation[]>;

	/**
	 * Retrieve related concepts with operator duality inversion and optional transitive path caching.
	 */
	getRelatedConcepts?(
		conceptId: string,
		direction?: TraversalDirection,
		maxDepth?: number,
		useCache?: boolean,
	): Promise<RelatedConceptResult[]>;

	/**
	 * Invalidate relation transitive cache for a specific concept or all concepts.
	 */
	invalidateRelationCache?(conceptId?: string): Promise<void>;
}

export interface PersistentExpressionStore {
	/**
	 * Save a custom abbreviation/expression in the database.
	 */
	save(expression: CustomExpression, scope: OwnerScope): Promise<void>;

	/**
	 * Delete a custom expression from the database.
	 */
	delete(id: string, scope: OwnerScope): Promise<void>;

	/**
	 * List all custom expressions visible to this scope.
	 */
	list(scope: OwnerScope, includeGlobal?: boolean): Promise<CustomExpression[]>;

	/**
	 * Retrieve a single custom expression by ID (for permission/existence checking).
	 */
	getById(id: string): Promise<CustomExpression | null>;
	searchCandidates?(
		request: ExpressionSearchRequest,
	): Promise<CustomExpression[]>;
}
