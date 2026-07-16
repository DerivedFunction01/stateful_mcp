/**
 * Defines a specific dictionary or terminology source (e.g., SNOMED, ICD-10).
 */
export interface Namespace {
  /** Unique classification code for the namespace (e.g., 'SNOMED', 'ICD-10') */
  code: string;
  /** Human-readable explanation of the terminology database scope */
  description?: string;
  /** If true, the namespace is openly queryable by any user or context */
  isPublic: boolean;
  /** If true, data resides in an external private store requiring authentication */
  isExternalPrivate: boolean;
  /** Identifier/name of the private database or integration connector */
  externalPrivateSource?: string;
  /** Endpoint URL for external REST/GraphQL concept lookup APIs */
  apiUrl?: string;
  /** Static query string parameters or path segments for the lookup request */
  apiUrlParams?: Record<string, any>;
  /** Default request body JSON payload structure sent to the external API */
  apiRequestPayload?: Record<string, any>;
  /** JSON-path mapping key to retrieve the display name from the API JSON response */
  apiResponseDisplayPath?: string;
}

/**
 * Represents a single canonical concept or standard code coordinate within a coding system.
 */
export interface Concept {
  /** Unique concept ID (e.g., UUID) */
  id: string;
  /** The namespace identifier this concept belongs to (e.g., 'SNOMED') */
  namespaceCode: string;
  /** The canonical coordinate/code value (e.g., 'I21.9' or 'R06.02') */
  standardCode: string;
  /** Default user-friendly fallback display label for the concept code */
  display: string;
  /** Semantic description or clinical explanation of the concept definition */
  description?: string;
  /** Optional date stamp indicating when the concept was assigned or declared */
  designationDate?: string;
}

/** Semantic mapping relationships linking two different concepts */
export type ConceptRelationType = 'EQUIVALENT' | 'NARROWER_THAN' | 'WIDER_THAN';

/**
 * Declares relationships between two different concepts (e.g. mapping synonyms or hierarchies).
 */
export interface ConceptRelation {
  /** Unique relationship record identifier */
  id: string;
  /** Source concept ID in the relationship */
  conceptId: string;
  /** Target concept ID linked to the source concept */
  linkedId: string;
  /** The semantic nature of the link (e.g., EQUIVALENT mapping) */
  relationshipType: ConceptRelationType;
  /** If false, the relation link is disabled and ignored */
  active: boolean;
  /** Optional date stamp of when the relationship was designated */
  designationDate?: string;
}

/** Classification defining the type of target assignment (e.g. 'MAIN_TERM' or 'METRIC') */
export type TargetAssignment = string;

/**
 * Defines a custom keyword pattern or alias mapping to map shorthand terms to concepts.
 */
export interface CustomExpression {
  /** Unique expression mapping record identifier */
  id: string;
  /** Default readable shorthand term or alias (e.g. 'heart attack') */
  term: string;
  /** Regex pattern compiled dynamically to evaluate match candidates */
  regexPattern: string;
  /** If true, regex matches ignore letter casing (case-insensitive flag) */
  isCaseInsensitive: boolean;
  /** Domain-specific role/assignment classification for this expression */
  targetAssignment: TargetAssignment;
  /** The target Concept ID this expression resolves/maps to */
  conceptId?: string;
  /** Static base scoring priority (higher values rank higher) */
  priorityWeight: number;
  /** If false, the expression mapping is ignored during resolution */
  active: boolean;
  /** Custom generic metadata dictionary (e.g. tags, workspace_id, description) */
  context?: Record<string, any>;
}

/**
 * Tracks historical statistics and metrics for resolved expressions.
 */
export interface ResolutionMetric {
  /** The custom expression ID that was successfully matched */
  expressionId: string;
  /** The concept ID that the expression resolved to */
  conceptId: string;
  /** Session/workspace context under which resolution took place */
  context: Record<string, any>;
  /** Total number of times this specific resolution mapping has been used */
  usageCount: number;
  /** ISO timestamp of the last successful resolution of this mapping */
  lastResolvedAt: string;
}

/**
 * Configuration payload containing lists of initial dictionary elements to load.
 */
export interface DictionaryConfig {
  /** List of predefined terminology namespaces to populate */
  namespaces?: Namespace[];
  /** List of pre-seeded canonical concepts to load */
  concepts?: Concept[];
  /** List of semantic concept relationships to configure */
  relations?: ConceptRelation[];
  /** Pre-seeded shorthand-to-concept expression mappings */
  expressions?: CustomExpression[];
  /** List of allowed values for targetAssignment validation */
  allowedTargetAssignments?: string[];
}

/**
 * Weight boundary configurations for a single dictionary resolution source.
 */
export interface BackendWeightConfig {
  /** Unique identifier for the resolution backend (e.g., 'personal', 'global') */
  id: string;
  /** Default scaling multiplier applied to candidate match scores */
  defaultWeight: number;
  /** Lower limit boundary preventing weight decay from dropping below a threshold */
  minWeight?: number;
  /** Upper limit boundary capping maximum weight growth on rewards */
  maxWeight?: number;
}
