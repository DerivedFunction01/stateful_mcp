export interface ExpressionSearchRequest {
	backendId: string;
	argumentId: string;
	text: string;
	offset: number;
}

export const EXPRESSION_MATCH_KINDS = ["exact", "prefix"] as const;
export type ExpressionMatchKind = (typeof EXPRESSION_MATCH_KINDS)[number];

export interface ExpressionCandidate {
	id: string;
	term: string;
	start: number;
	end: number;
	matchKind: ExpressionMatchKind;
	priority?: number;
	canonicalValue: unknown;
	conceptId?: string;
	displayValue?: string;
	metadata?: Record<string, unknown>;
	ownerExtensionId?: string;
	resourceId?: string;
	resolverId?: string;
	resolverVersion?: string | number;
	snapshotVersion?: string | number;
}

export interface ExpressionBackend {
	search(request: ExpressionSearchRequest): readonly ExpressionCandidate[];
	/** Stable identity used to invalidate accepted bindings when resources change. */
	version?: string | number;
	backendVersion?: string | number;
	ownerExtensionId?: string;
	resourceId?: string;
	resolverId?: string;
	identity?: {
		extensionId: string;
		resourceId: string;
		version: string | number;
	};
}
