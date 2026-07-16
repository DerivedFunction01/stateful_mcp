export interface Namespace {
  code: string; // e.g., 'SNOMED', 'ICD-10', 'CATALOG'
  description?: string;
  isPublic: boolean;
  isExternalPrivate: boolean;
  externalPrivateSource?: string;
  apiUrl?: string;
  apiUrlParams?: Record<string, any>;
  apiRequestPayload?: Record<string, any>;
  apiResponseDisplayPath?: string;
}

export interface Concept {
  id: string; // UUID
  namespaceCode: string;
  standardCode: string; // The code coordinate, e.g., 'R06.02'
  display: string;      // Fallback display name
  description?: string;
  designationDate?: string;
}

export type ConceptRelationType = 'EQUIVALENT' | 'NARROWER_THAN' | 'WIDER_THAN';

export interface ConceptRelation {
  id: string;
  conceptId: string;
  linkedId: string;
  relationshipType: ConceptRelationType;
  active: boolean;
  designationDate?: string;
}

export type TargetAssignment = string;

export interface CustomExpression {
  id: string;
  term: string; // Human-friendly term
  regexPattern: string; // Regex pattern (compiled dynamically)
  isCaseInsensitive: boolean;
  targetAssignment: TargetAssignment;
  conceptId?: string; // Target concept mapping
  priorityWeight: number;
  active: boolean;
  context?: Record<string, any>; // Generic metadata matching tags, facility, workspace, etc.
}

export interface ResolutionMetric {
  expressionId: string;
  conceptId: string;
  context: Record<string, any>;
  usageCount: number;
  lastResolvedAt: string;
}

export interface DictionaryConfig {
  namespaces?: Namespace[];
  concepts?: Concept[];
  relations?: ConceptRelation[];
  expressions?: CustomExpression[];
  allowedTargetAssignments?: string[];
}
