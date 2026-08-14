export interface ExpressionSearchRequest {
	backendId: string;
	argumentId: string;
	text: string;
	offset: number;
}

export interface ExpressionCandidate {
	id: string;
	term: string;
	start: number;
	end: number;
	matchKind: "exact" | "prefix";
	priority?: number;
	canonicalValue: unknown;
	conceptId?: string;
	displayValue?: string;
	metadata?: Record<string, unknown>;
}

export interface ExpressionBackend {
	search(request: ExpressionSearchRequest): readonly ExpressionCandidate[];
	/** Stable identity used to invalidate accepted bindings when resources change. */
	version?: string;
	backendVersion?: string;
}
