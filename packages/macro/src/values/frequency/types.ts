import type { MessageParam } from "@stateful-mcp/macro-protocol";
import type { BaseValueGrammarConfig } from "../numeric";
import type { FrequencyToken, ValueFormatConfig } from "../token-spec";

export const CADENCE_TYPES = [
	"interval",
	"recurrence",
	"event_anchored",
	"continuous",
	"one_time",
] as const;

export type CadenceType = (typeof CADENCE_TYPES)[number];

export interface CadenceSchedule<
	TAnchor extends string = string,
	TUnit extends string = string,
	TCadence extends string = CadenceType,
> {
	readonly cadenceType: TCadence;
	readonly interval?: {
		readonly multiplier: number;
		readonly unit: TUnit;
		readonly upperMultiplier?: number;
	};
	readonly recurrence?: {
		readonly count: number;
		readonly period: TUnit;
		readonly upperCount?: number;
	};
	readonly eventAnchor?: TAnchor;
	readonly relativeOffset?: {
		readonly direction: "before" | "after" | "at" | "with";
		readonly duration?: {
			readonly magnitude: number;
			readonly unit: TUnit;
		};
	};
	readonly isConditional?: boolean;
	readonly condition?: string;
	readonly rawText?: string;
}

export interface FrequencyGrammarConfig<
	TAnchor extends string = string,
	TUnit extends string = string,
> extends BaseValueGrammarConfig {
	readonly templates?: readonly (ValueFormatConfig<FrequencyToken> | string)[];
	readonly frequencyAliases?: Readonly<
		Record<string, Partial<CadenceSchedule<TAnchor, TUnit>>>
	>;
	readonly multiplierAliases?: Readonly<Record<string, readonly string[]>>;
	readonly timeUnitAliases?: Readonly<Record<TUnit, readonly string[]>>;
	readonly eventAnchorAliases?: Readonly<Record<TAnchor, readonly string[]>>;
	readonly conditionalAliases?: readonly string[];
	readonly conditionConnectors?: readonly string[];
	readonly intervalPrefixes?: readonly string[];
	readonly recurrenceConnectors?: readonly string[];
	readonly rangeDelimiters?: readonly string[];
	readonly relativeOffsetConnectors?: Readonly<
		Record<"before" | "after" | "at" | "with", readonly string[]>
	>;
}

export interface FrequencyConsumerPolicy<
	TAnchor extends string = string,
	TUnit extends string = string,
> {
	readonly allowedAnchors?: readonly TAnchor[];
	readonly allowedUnits?: readonly TUnit[];
	readonly allowedCadenceTypes?: readonly CadenceType[];
	readonly allowConditional?: boolean;
}

export interface FrequencyDiagnostic {
	readonly code: string;
	readonly messageKey?: string;
	readonly messageParams?: Readonly<Record<string, MessageParam>>;
}

export interface CadenceScheduleResolution<
	TAnchor extends string = string,
	TUnit extends string = string,
> {
	readonly value?: CadenceSchedule<TAnchor, TUnit>;
	readonly diagnostics: readonly FrequencyDiagnostic[];
}
