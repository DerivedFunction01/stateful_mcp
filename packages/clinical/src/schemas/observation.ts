import type {
	Certainty,
	ClinicalDateRange,
	ClinicalSourceType,
	CodeableConcept,
	Status,
	TimeMeasurement,
} from "./shared";

export interface ObservationEvent {
	id: string;
	soapSection: "subjective" | "objective" | "assessment";
	concept: CodeableConcept;
	rawTerm: string;
	sourceType: ClinicalSourceType;
	certainty?: Certainty;
	status?: Status;
	severity: {
		score: number;
		maxScore: number;
		normalizedScore: number;
	};
	duration: TimeMeasurement;
	trajectory:
		| "improving"
		| "worsening"
		| "stable"
		| "resolved"
		| "fluctuating"
		| "unknown";
	qualifiers?: CodeableConcept[];
	dateRange?: ClinicalDateRange;
}

export class ObservationHelper {
	static parseSeverity(
		groups: { numerator: string; denominator?: string },
		config: { baseScale: number } = { baseScale: 10 },
	): { score: number; maxScore: number; normalizedScore: number } {
		const num = Number.parseFloat(groups.numerator);
		const den = groups.denominator
			? Number.parseFloat(groups.denominator)
			: config.baseScale;
		const normalized = (num / den) * config.baseScale;
		return { score: num, maxScore: den, normalizedScore: normalized };
	}
}
