// ── Autocomplete Transition Store ───────────────────────────────────────────

export interface AutocompleteFeature {
	key: string;
	value: string | null;
	numericalValue: number | null;
}

export interface AutocompleteTransitionKey {
	personnelId: string;
	templateId: string;
	fromSlot: string;
	toSlot: string;
	featureKey: string;
	featureValue?: string;
}

export interface AutocompleteTransitionRecord {
	personnelId: string;
	templateId: string;
	fromSlot: string;
	toSlot: string;
	featureKey: string;
	featureValue: string | null;
	numericalValue: number | null;
	selectionCount: number;
	lastUpdatedAt: string;
}

export interface AutocompleteTransitionInsertPlan {
	table: string;
	personnelId: string;
	templateId: string;
	fromSlot: string;
	toSlot: string;
	featureKey: string;
	featureValue: string | null;
	numericalValue: number | null;
	selectionCount: number;
	lastUpdatedAt: string;
}

export interface AutocompleteTransitionDecayedAggregatePlan {
	table: string;
	personnelId: string;
	templateId: string;
	fromSlot: string;
	halfLifeDays: number;
}

export interface AutocompleteTransitionContinuousAggregatePlan {
	table: string;
	personnelId: string;
	templateId: string;
	fromSlot: string;
	featureKey: string;
}

export interface AutocompleteTransitionStore {
	increment(plan: AutocompleteTransitionInsertPlan): Promise<void>;
	getByFromSlot(
		key: AutocompleteTransitionKey,
	): Promise<AutocompleteTransitionRecord[]>;
	getDecayedAggregate(
		plan: AutocompleteTransitionDecayedAggregatePlan,
	): Promise<Record<string, number>>;
	getContinuousAggregate(
		plan: AutocompleteTransitionContinuousAggregatePlan,
	): Promise<Record<string, { mu: number; sigmaSq: number }>>;
}

export interface SystemWeightStore {
	getWeight(category: string, key: string, subKey?: string): Promise<number>;
	setWeight(
		category: string,
		key: string,
		value: number,
		subKey?: string,
	): Promise<void>;
	adjustWeight(
		category: string,
		key: string,
		delta: number,
		subKey?: string,
	): Promise<void>;
	getWeightsForCategory(
		category: string,
		key: string,
	): Promise<Record<string, number>>;
}

// ── N-Gram Store ──────────────────────────────────────────────────────────────

export interface NgramRecord {
	ngram: string;
	n: 1 | 2 | 3;
	kind: import("../stores/auto-complete/interfaces").AutocompleteSuggestionKind;
	frequency: number;
	lastUpdatedAt: string;
	templateId?: string;
	slotName?: string;
}

export interface NgramSuggestion {
	ngram: string;
	n: 1 | 2 | 3;
	kind: import("../stores/auto-complete/interfaces").AutocompleteSuggestionKind;
	frequency: number;
	lastUpdatedAt: string;
}

export interface NgramStore {
	increment(
		ngram: string,
		n: 1 | 2 | 3,
		kind: import("../stores/auto-complete/interfaces").AutocompleteSuggestionKind,
		ctx?: { templateId?: string; slotName?: string },
	): Promise<void>;
	suggest(prefix: string, limit?: number): Promise<NgramSuggestion[]>;
	getTopByKind(
		kind: import("../stores/auto-complete/interfaces").AutocompleteSuggestionKind,
		limit?: number,
	): Promise<NgramSuggestion[]>;
}
