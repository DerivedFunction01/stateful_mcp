import type { ClinicalDateRange, TimePrecisionLevel, TemporalDirection } from "../schemas/schemas-interface/time";
import type { V2TemporalSyntaxProfile } from "./temporal-syntax-profile";

export type TemporalExpression =
	| { kind: "absolute_instant"; instant: string; precision: TimePrecisionLevel }
	| { kind: "relative"; direction: TemporalDirection; amount: number; unit: TimePrecisionLevel }
	| { kind: "relative_day"; offsetDays: number }
	| { kind: "range"; start: TemporalExpression; end: TemporalExpression }
	| { kind: "repeat"; multiplier: number; unit: TimePrecisionLevel; expression?: TemporalExpression }
	| { kind: "date_range"; value: ClinicalDateRange };

export interface TemporalAnchor {
	referenceInstant: string;
	timezone: string;
	locale?: string;
}

export type TemporalRecognitionProfile = V2TemporalSyntaxProfile;

export interface TemporalResolveResult { value?: ClinicalDateRange; diagnostics: TemporalDiagnostic[]; }
export interface TemporalDiagnostic { code: "invalid_expression" | "invalid_anchor" | "invalid_range" | "unsupported_unit" | "ambiguous"; message: string; }
