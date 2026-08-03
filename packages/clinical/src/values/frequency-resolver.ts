import type {
	CadenceBaseType,
	PhysiologicalEventAnchor,
} from "../schemas/schemas-interface/medication";
import type { CodeableConcept } from "../schemas/schemas-interface/shared";
import type { TimePrecisionLevel } from "../schemas/schemas-interface/time";

export interface FrequencyProfile {
	aliases: Readonly<
		Record<string, { multiplier: number; unit: TimePrecisionLevel }>
	>;
}
export interface FrequencyResolution {
	cadenceType: CadenceBaseType;
	interval?: { multiplier: number; unit: TimePrecisionLevel };
	rate?: { times: number; period: TimePrecisionLevel };
	eventAnchor?: PhysiologicalEventAnchor;
	isPrn: boolean;
	prnReason?: CodeableConcept;
}

export function resolveFrequency(
	input: {
		alias?: string;
		times?: number;
		period?: TimePrecisionLevel;
		prn?: boolean;
		eventAnchor?: PhysiologicalEventAnchor;
		prnReason?: CodeableConcept;
	},
	profile: FrequencyProfile,
): FrequencyResolution {
	const shorthand = input.alias ? profile.aliases[input.alias] : undefined;
	const res: FrequencyResolution = {
		cadenceType: input.eventAnchor
			? "event_anchored"
			: input.times && input.period
				? "interval"
				: shorthand
					? "interval"
					: "one_time",
		rate:
			!input.eventAnchor && input.times && input.period
				? { times: input.times, period: input.period }
				: undefined,
		isPrn: input.prn === true,
		eventAnchor: input.eventAnchor,
		prnReason: input.prnReason,
	};
	if (shorthand && !input.eventAnchor) {
		res.interval = { ...shorthand };
	}
	return res;
}
