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
  id: string;
  namespaceCode: string;
  standardCode: string;
  display: string;
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
  term: string;
  regexPattern: string;
  isCaseInsensitive: boolean;
  targetAssignment: TargetAssignment;
  conceptId?: string;
  priorityWeight: number;
  active: boolean;
  context?: Record<string, any>;
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

export interface BackendWeightConfig {
  id: string;
  defaultWeight: number;
  minWeight?: number;
  maxWeight?: number;
}
