import type {
	ParsedCellPreferenceMode,
	ParsedCellPreferenceProjection,
	ParsedCellPreferenceRanking,
	ParsedCellPreview,
	ParsedCellRanker,
	ParsedCellRankerContext,
	ParsedCellRankerScore,
} from "./parsed-cell-ranking-types";
import type { ParsedCellObservationDetailV1 } from "./parsed-cell-store";

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
