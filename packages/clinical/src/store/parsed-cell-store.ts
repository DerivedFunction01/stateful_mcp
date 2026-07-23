import type { Database } from "bun:sqlite";
import { SqliteEntityStore } from "@stateful-mcp/core";
import type {
	ParsedItem,
	ParsedObservationItem,
} from "../parser/schema-parsers";

export type ParsedCellSourceKind = "direct_contract" | "fallback" | "heuristic";
export type ParsedCellOutcome = "accepted" | "rejected" | "corrected";

export interface ParsedCellV1Shared {
	cellId: string;
	sessionId?: string;
	personnelId?: string;
	specialtyId?: string;
	facilityId?: string;
	workspaceId?: string;
	tag: string;
	targetSchema: string;
	rawText: string;
	normalizedText?: string;
	anchorText: string;
	parserVersion: string;
	contractVersion: string;
	sourceKind: ParsedCellSourceKind;
	outcome: ParsedCellOutcome;
	replacedByCellId?: string;
	acceptedAt?: string;
	createdAt: string;
	updatedAt: string;
}

export interface ParsedCellCandidateTokenV1 {
	text: string;
	start: number;
	end: number;
	kind?: string;
	sourceRule?: string;
}

export interface ParsedCellV1ObservedShape {
	schema: string;
	slots: Record<string, any>;
}

export interface ParsedCellObservationDetailV1 {
	cellId: string;
	conceptId?: string;
	display: string;
	certainty?: string;
	status?: string;
	severity?: string;
	candidateTokens: ParsedCellCandidateTokenV1[];
	contextTokens?: string[];
	shape: ParsedCellV1ObservedShape;
	parsedItem: ParsedObservationItem;
	provenance?: {
		parserPath?: string;
		matchedRegexes?: string[];
		conceptHit?: string;
	};
	history?: {
		priorAcceptCount?: number;
		priorCorrectionCount?: number;
		lastAcceptedAt?: string;
		lastCorrectedAt?: string;
		recencyScore?: number;
	};
	flags?: {
		contractValid?: boolean;
		stalePreference?: boolean;
		reviewRequired?: boolean;
	};
}

export interface ParsedCellV1<TParsedItem extends ParsedItem = ParsedItem> {
	shared: ParsedCellV1Shared;
	parsedItem: TParsedItem;
}

export interface ParsedCellJoinResult<
	TParsedItem extends ParsedItem = ParsedItem,
> {
	shared: ParsedCellV1Shared;
	detail: ParsedCellObservationDetailV1 | null;
	parsedItem: TParsedItem | null;
}

export interface ParsedCellRankerContext {
	tag: string;
	targetSchema: string;
	personnelId?: string;
	specialtyId?: string;
	facilityId?: string;
	rawText: string;
	anchorText: string;
	candidateTokens: ParsedCellCandidateTokenV1[];
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

export interface ParsedCellHistoryStore {
	getObservationHistory(
		key: ParsedCellHistoryKey,
	): Promise<ParsedCellObservationDetailV1[]>;
	putObservation(record: ParsedCellV1<ParsedObservationItem>): Promise<void>;
}

export interface ParsedCellHistoryKey {
	personnelId?: string;
	specialtyId?: string;
	facilityId?: string;
	tag: string;
	targetSchema: string;
	rawText: string;
}

export function buildObservationShape(
	item: ParsedObservationItem,
): ParsedCellV1ObservedShape {
	return {
		schema: item.targetSchema,
		slots: {
			conceptId: item.conceptId,
			severity: item.severity,
			certainty: item.certainty,
			status: item.status,
		},
	};
}

export function scoreRecency(lastAt?: string, now = Date.now()): number {
	if (!lastAt) return 0;
	const elapsedDays = Math.max(0, (now - Date.parse(lastAt)) / 86_400_000);
	return 1 / (1 + elapsedDays);
}

export interface ParsedCellStore {
	putObservation(record: ParsedCellV1<ParsedObservationItem>): Promise<void>;
	get(cellId: string): Promise<ParsedCellJoinResult | null>;
	listBySession(sessionId: string): Promise<ParsedCellJoinResult[]>;
	listObservationPilots(
		sessionId?: string,
	): Promise<ParsedCellJoinResult<ParsedObservationItem>[]>;
}

export class MemoryParsedCellStore implements ParsedCellStore {
	private shared = new Map<string, ParsedCellV1Shared>();
	private observationDetails = new Map<string, ParsedCellObservationDetailV1>();

	async putObservation(
		record: ParsedCellV1<ParsedObservationItem>,
	): Promise<void> {
		this.shared.set(record.shared.cellId, record.shared);
		this.observationDetails.set(record.shared.cellId, {
			cellId: record.shared.cellId,
			conceptId: record.parsedItem.conceptId,
			display: record.parsedItem.display,
			certainty: record.parsedItem.certainty,
			status: record.parsedItem.status,
			severity: record.parsedItem.severity,
			candidateTokens: [],
			shape: buildObservationShape(record.parsedItem),
			parsedItem: record.parsedItem,
			history: {
				priorAcceptCount: 1,
				priorCorrectionCount: 0,
				lastAcceptedAt: record.shared.acceptedAt,
				recencyScore: scoreRecency(record.shared.acceptedAt),
			},
			flags: {
				contractValid: true,
				stalePreference: false,
				reviewRequired: false,
			},
		});
	}

	async get(cellId: string): Promise<ParsedCellJoinResult | null> {
		const shared = this.shared.get(cellId);
		if (!shared) return null;
		return {
			shared,
			detail: this.observationDetails.get(cellId) || null,
			parsedItem: this.observationDetails.get(cellId)?.parsedItem || null,
		};
	}

	async listBySession(sessionId: string): Promise<ParsedCellJoinResult[]> {
		return Array.from(this.shared.values())
			.filter((row) => row.sessionId === sessionId)
			.map((shared) => ({
				shared,
				detail: this.observationDetails.get(shared.cellId) || null,
				parsedItem:
					this.observationDetails.get(shared.cellId)?.parsedItem || null,
			}));
	}

	async listObservationPilots(
		sessionId?: string,
	): Promise<ParsedCellJoinResult<ParsedObservationItem>[]> {
		const rows = Array.from(this.shared.values()).filter((row) => {
			if (row.targetSchema !== "ObservationEvent") return false;
			if (sessionId && row.sessionId !== sessionId) return false;
			return true;
		});
		return rows.map((shared) => ({
			shared,
			detail: this.observationDetails.get(shared.cellId) || null,
			parsedItem:
				this.observationDetails.get(shared.cellId)?.parsedItem || null,
		}));
	}
}

export class ObservationPreferenceRanker
	implements ParsedCellRanker<ParsedCellObservationDetailV1>
{
	score(
		candidate: ParsedCellObservationDetailV1,
		context: ParsedCellRankerContext,
	): ParsedCellRankerScore {
		const sharedSlots = context.sharedShape.slots;
		const candidateSlots = candidate.shape.slots;
		let score = 0;
		const reasons: string[] = [];

		for (const key of ["conceptId", "severity", "certainty", "status"]) {
			if (sharedSlots[key] && candidateSlots[key] === sharedSlots[key]) {
				score += 3;
				reasons.push(`exact-${key}`);
			}
		}

		if (candidate.history?.recencyScore) {
			score += candidate.history.recencyScore;
			reasons.push("recency");
		}

		if (candidate.history?.priorAcceptCount) {
			score += Math.min(candidate.history.priorAcceptCount, 5) * 0.2;
			reasons.push("history");
		}

		if (candidate.flags?.contractValid) {
			score += 1;
			reasons.push("contract");
		}

		return { score, reason: reasons.join(",") || "baseline" };
	}

	choose(
		deterministic: ParsedCellObservationDetailV1 | null,
		learned: ParsedCellObservationDetailV1 | null,
		context: ParsedCellRankerContext,
		mode: ParsedCellPreferenceMode = "dual",
	): ParsedCellPreferenceProjection<ParsedCellObservationDetailV1> {
		const deterministicScore = deterministic
			? this.score(deterministic, context)
			: undefined;
		const learnedScore = learned ? this.score(learned, context) : undefined;
		let winner: ParsedCellObservationDetailV1 | null = null;

		if (mode === "deterministic") {
			winner = deterministic;
		} else if (mode === "learned") {
			winner = learned;
		} else if ((learnedScore?.score || 0) >= (deterministicScore?.score || 0)) {
			winner = learned;
		} else {
			winner = deterministic;
		}

		return {
			mode,
			deterministic,
			learned,
			winner,
			deterministicScore,
			learnedScore,
		};
	}

	rankMany(
		candidates: Array<{
			candidate: ParsedCellObservationDetailV1;
			source: "deterministic" | "learned";
		}>,
		context: ParsedCellRankerContext,
		mode: ParsedCellPreferenceMode = "dual",
	): ParsedCellPreferenceRanking<ParsedCellObservationDetailV1> {
		const scored = candidates
			.map((entry) => ({
				candidate: entry.candidate,
				score: this.score(entry.candidate, context),
				source: entry.source,
			}))
			.sort((a, b) => b.score.score - a.score.score);

		if (mode === "deterministic") {
			const deterministic = scored.find(
				(row) => row.source === "deterministic",
			);
			return {
				mode,
				candidates: deterministic ? [deterministic] : [],
				winner: deterministic?.candidate || null,
			};
		}

		if (mode === "learned") {
			const learned = scored.find((row) => row.source === "learned");
			return {
				mode,
				candidates: learned ? [learned] : [],
				winner: learned?.candidate || null,
			};
		}

		return {
			mode,
			candidates: scored,
			winner: scored[0]?.candidate || null,
		};
	}

	previewMany(
		candidates: Array<{
			candidate: ParsedCellObservationDetailV1;
			source: "deterministic" | "learned";
		}>,
		context: ParsedCellRankerContext,
		mode: ParsedCellPreferenceMode = "dual",
	): ParsedCellPreview<ParsedCellObservationDetailV1> {
		const ranking = this.rankMany(candidates, context, mode);
		return {
			deterministic: candidates
				.filter((entry) => entry.source === "deterministic")
				.map((entry) => entry.candidate),
			learned: candidates
				.filter((entry) => entry.source === "learned")
				.map((entry) => entry.candidate),
			ranking,
		};
	}
}

export class SqliteParsedCellStore implements ParsedCellStore {
	private sharedStore: SqliteEntityStore<ParsedCellV1Shared>;
	private observationDetailStore: SqliteEntityStore<ParsedCellObservationDetailV1>;

	constructor(
		db: Database,
		sharedTable = "parsed_cell_v1_shared",
		observationDetailTable = "parsed_cell_v1_observation_detail",
	) {
		this.sharedStore = new SqliteEntityStore<ParsedCellV1Shared>(
			db,
			sharedTable,
		);
		this.observationDetailStore =
			new SqliteEntityStore<ParsedCellObservationDetailV1>(
				db,
				observationDetailTable,
			);
	}

	async putObservation(
		record: ParsedCellV1<ParsedObservationItem>,
	): Promise<void> {
		await this.sharedStore.set(record.shared.cellId, record.shared);
		await this.observationDetailStore.set(record.shared.cellId, {
			cellId: record.shared.cellId,
			conceptId: record.parsedItem.conceptId,
			display: record.parsedItem.display,
			certainty: record.parsedItem.certainty,
			status: record.parsedItem.status,
			severity: record.parsedItem.severity,
			candidateTokens: [],
			shape: {
				schema: record.parsedItem.targetSchema,
				slots: {
					certainty: record.parsedItem.certainty,
					status: record.parsedItem.status,
					severity: record.parsedItem.severity,
				},
			},
			parsedItem: record.parsedItem,
		});
	}

	async get(cellId: string): Promise<ParsedCellJoinResult | null> {
		const shared = await this.sharedStore.get(cellId);
		if (!shared) return null;
		const detail = await this.observationDetailStore.get(cellId);
		return {
			shared,
			detail,
			parsedItem: detail?.parsedItem || null,
		};
	}

	async listBySession(sessionId: string): Promise<ParsedCellJoinResult[]> {
		const sharedRows = await this.sharedStore.list();
		const results: ParsedCellJoinResult[] = [];
		for (const shared of sharedRows) {
			if (shared.sessionId !== sessionId) continue;
			const detail = await this.observationDetailStore.get(shared.cellId);
			results.push({ shared, detail, parsedItem: detail?.parsedItem || null });
		}
		return results;
	}

	async listObservationPilots(
		sessionId?: string,
	): Promise<ParsedCellJoinResult<ParsedObservationItem>[]> {
		const sharedRows = await this.sharedStore.list();
		const results: ParsedCellJoinResult<ParsedObservationItem>[] = [];
		for (const shared of sharedRows) {
			if (shared.targetSchema !== "ObservationEvent") continue;
			if (sessionId && shared.sessionId !== sessionId) continue;
			const detail = await this.observationDetailStore.get(shared.cellId);
			results.push({
				shared,
				detail,
				parsedItem: detail?.parsedItem || null,
			});
		}
		return results;
	}
}
