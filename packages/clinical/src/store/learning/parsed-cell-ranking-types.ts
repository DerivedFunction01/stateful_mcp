import type {
	ParsedCellObservationDetailV1,
	ParsedCellV1ObservedShape,
} from "./parsed-cell-store";

export interface ParsedCellRankerContext {
	tag: string;
	targetSchema: string;
	patientId?: string;
	patientOrganismType?: string;
	patientGender?: string;
	patientAgeBucket?: string;
	patientSpeciesBucket?: string;
	patientSubBucket?: number;
	patientBucketKey?: string;
	personnelId?: string;
	specialtyId?: string;
	facilityId?: string;
	rawText: string;
	anchorText: string;
	candidateTokens: unknown[];
	sharedShape: ParsedCellV1ObservedShape;
	history?: ParsedCellObservationDetailV1["history"];
}

export interface ParsedCellRankerScore {
	score: number;
	reason?: string;
}

export type ParsedCellPreferenceMode = "deterministic" | "learned" | "dual";

export interface ParsedCellPreferenceProjection<TCandidate = unknown> {
	mode: ParsedCellPreferenceMode;
	deterministic: TCandidate | null;
	learned: TCandidate | null;
	winner: TCandidate | null;
	deterministicScore?: ParsedCellRankerScore;
	learnedScore?: ParsedCellRankerScore;
}

export interface ParsedCellPreferenceCandidate<TCandidate = unknown> {
	candidate: TCandidate;
	score: ParsedCellRankerScore;
	source: "deterministic" | "learned";
}

export interface ParsedCellPreferenceRanking<TCandidate = unknown> {
	mode: ParsedCellPreferenceMode;
	candidates: ParsedCellPreferenceCandidate<TCandidate>[];
	winner: TCandidate | null;
}

export interface ParsedCellPreview<TCandidate = unknown> {
	deterministic: TCandidate[];
	learned: TCandidate[];
	ranking: ParsedCellPreferenceRanking<TCandidate>;
}

export interface ParsedCellRanker<TCandidate = unknown> {
	score(
		candidate: TCandidate,
		context: ParsedCellRankerContext,
	): Promise<ParsedCellRankerScore> | ParsedCellRankerScore;
}
