// ── Macro transition learning ────────────────────────────────────────────────

import type { AutocompleteSuggestionKind } from "../stores/auto-complete/interfaces";

export type LearningScope = "personal" | "global";
export type LearningObservationMode = "live" | "preview" | "execution";
export type LearningOutcome = "positive" | "negative" | "corrected";

export interface MacroTransitionKey {
	macroId: string;
	macroVersion: number;
	fromSlot: string;
	toSlot: string;
	featureKey: string;
	featureValue: string | null;
	scope: LearningScope;
	scopeKey: string;
	observationMode: LearningObservationMode;
}

export interface MacroTransitionObservation extends MacroTransitionKey {
	numericalValue?: number | null;
	outcome?: LearningOutcome;
	occurredAt?: string;
	sessionId?: string;
	observationId?: string;
}

export interface MacroTransitionRecord extends MacroTransitionKey {
	transitionCount: number;
	lastUpdatedAt: string;
}

export interface NumericFeatureStatistics {
	count: number;
	mean: number;
	standardDeviationPopulation: number | null;
	lastUpdatedAt?: string;
}

export interface MacroTransitionQuery {
	macroId: string;
	macroVersion: number;
	fromSlot: string;
	scope: LearningScope;
	scopeKey: string;
	observationModes?: readonly LearningObservationMode[];
	featureKey?: string;
	featureValue?: string | null;
	toSlots?: readonly string[];
}

export interface MacroTransitionStore {
	increment(observation: MacroTransitionObservation): Promise<void>;
	getByFromSlot(query: MacroTransitionQuery): Promise<MacroTransitionRecord[]>;
	getNumericStatistics(
		query: MacroTransitionQuery,
	): Promise<Record<string, NumericFeatureStatistics>>;
}

/** Compatibility name for the previously declared, unused interface. */
export type AutocompleteTransitionStore = MacroTransitionStore;

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
	applyFeedback(update: SystemWeightFeedbackUpdate): Promise<number>;
	getWeightsForCategory(
		category: string,
		key: string,
	): Promise<Record<string, number>>;
}

export interface SystemWeightFeedbackUpdate {
	category: string;
	key: string;
	subKey?: string;
	delta: number;
	learningRate?: number;
	min?: number;
	max?: number;
	signal: LearningOutcome;
	correlationId?: string;
}

// ── N-Gram Store ──────────────────────────────────────────────────────────────

export interface NgramRecord {
	ngram: string;
	n: 1 | 2 | 3;
	kind: AutocompleteSuggestionKind;
	frequency: number;
	lastUpdatedAt: string;
	templateId?: string;
	slotName?: string;
}

export interface NgramSuggestion {
	ngram: string;
	n: 1 | 2 | 3;
	kind: AutocompleteSuggestionKind;
	frequency: number;
	lastUpdatedAt: string;
}

export interface NgramStore {
	increment(
		ngram: string,
		n: 1 | 2 | 3,
		kind: AutocompleteSuggestionKind,
		ctx?: { templateId?: string; slotName?: string },
	): Promise<void>;
	suggest(prefix: string, limit?: number): Promise<NgramSuggestion[]>;
	getTopByKind(
		kind: AutocompleteSuggestionKind,
		limit?: number,
	): Promise<NgramSuggestion[]>;
}
