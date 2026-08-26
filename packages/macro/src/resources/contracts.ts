import type { ConfiguredConceptResolver } from "../contracts/backends";

export const DICTIONARY_RECORD_TYPES = [
	"namespace",
	"concept",
	"relation",
	"expression",
] as const;
export type DictionaryRecordType = (typeof DICTIONARY_RECORD_TYPES)[number];

export interface ResourceDiagnostic {
	code: string;
	message: string;
	recordType?: DictionaryRecordType;
	recordId?: string;
	severity?: "warning" | "error";
	/** Structured i18n key; the canonical message carrier for user-facing surfaces. */
	messageKey?: string;
	messageParams?: Readonly<
		Record<string, import("@stateful-mcp/macro-protocol").MessageParam>
	>;
}

export interface NamespaceSeed {
	code: string;
	description?: string;
	isPublic?: boolean;
	isExternalPrivate?: boolean;
	isMutable?: boolean;
	externalPrivateSource?: string;
	apiUrl?: string;
	apiUrlParams?: Record<string, unknown>;
	apiRequestPayload?: Record<string, unknown>;
	apiResponseDisplayPath?: string;
}

export interface ConceptSeed {
	id: string;
	namespaceCode?: string;
	standardCode?: string;
	display?: string;
	value?: unknown;
	active?: boolean;
	metadata?: Record<string, unknown>;
}

export interface RelationSeed {
	id: string;
	conceptId: string;
	linkedId: string;
	relationshipType: string;
	active?: boolean;
	metadata?: Record<string, unknown>;
}

export interface ExpressionSeed {
	id: string;
	term: string;
	lookupTerm?: string;
	regexPattern?: string;
	isCaseInsensitive?: boolean;
	conceptId?: string;
	canonicalValue?: unknown;
	priorityWeight?: number;
	active?: boolean;
	metadata?: Record<string, unknown>;
}

export interface DictionarySeed {
	namespaces?: readonly NamespaceSeed[];
	concepts?: readonly ConceptSeed[];
	relations?: readonly RelationSeed[];
	expressions?: readonly ExpressionSeed[];
}

export type SeedCount = Record<DictionaryRecordType, number>;

export interface DictionarySeedReport {
	inserted: SeedCount;
	updated: SeedCount;
	skipped: SeedCount;
	diagnostics: ResourceDiagnostic[];
}

export interface NeutralNamespace extends NamespaceSeed {
	readonly code: string;
}

export interface NeutralConcept extends ConceptSeed {
	readonly namespaceCode: string;
	readonly standardCode: string;
	readonly display: string;
	readonly active: boolean;
}

export interface ConceptSearchOptions {
	namespaceCode?: string;
	limit?: number;
	roleName?: string;
}

export interface ResourceIdentity {
	extensionId: string;
	resourceId: string;
	version: string | number;
}

export interface DictionaryResource {
	readonly id: string;
	readonly ownerExtensionId: string;
	readonly version: string | number;
	readonly identity: ResourceIdentity;

	seed(seed: DictionarySeed): Promise<DictionarySeedReport>;

	concepts: {
		getById(id: string): Promise<NeutralConcept | undefined>;
		search(
			query: string,
			options?: ConceptSearchOptions,
		): Promise<NeutralConcept[]>;
	};
	/** Resolver with stable provenance for configured value recipes. */
	conceptResolver(): ConfiguredConceptResolver;
	close(): Promise<void>;
}

export interface DictionaryResourceOptions {
	id?: string;
	ownerExtensionId?: string;
	allowUnresolvedExpressions?: boolean;
	strict?: boolean;
	defaultScope?: "global" | { level: "user"; userId: string };
	/** Apply one backend specification to both dictionary stores. */
	backend?: DictionaryBackendSpec;
	/** Configure concept and expression stores independently when required. */
	concept?: DictionaryBackendSpec;
	expression?: DictionaryBackendSpec;
}

export type DictionaryBackendType =
	| "memory"
	| "jsonl"
	| "localstorage"
	| "indexeddb"
	| "sqlite"
	| "postgres"
	| "duckdb"
	| "opfs";

export interface DictionaryBackendSpec {
	type: DictionaryBackendType;
	target?: string;
	capabilities?: Record<string, boolean>;
	permissions?: Record<string, boolean>;
	schemaMode?: "initialize" | "validate_only" | "read_only";
}

export interface DictionaryResourceFactory {
	open(options?: DictionaryResourceOptions): Promise<DictionaryResource>;
	memory(options?: DictionaryResourceOptions): Promise<DictionaryResource>;
	jsonl(
		path: string,
		options?: DictionaryResourceOptions,
	): Promise<DictionaryResource>;
}
