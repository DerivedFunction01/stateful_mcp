import type { Concept, CustomExpression, Namespace } from "./types";
import type { OwnerScope } from "../../config/types";

export interface ConceptStore {
  /**
   * Search concepts by term, matching ID, code, display, or description.
   */
  search(query: string, namespaceCode?: string, limit?: number): Promise<Concept[]>;

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
}
