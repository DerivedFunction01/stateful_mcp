import type {
	CadenceSchedule,
	FrequencyConsumerPolicy,
	FrequencyDiagnostic,
	FrequencyGrammarConfig,
} from "./types";

/**
 * Shared parsing context for cadence grammar evaluation. Holds the resolved
 * configuration-derived aliases, the mutable working text, conditional state,
 * accumulated diagnostics, and the unit/multiplier resolvers so that the
 * focused per-branch extractors can operate without closures over the original
 * function body.
 */
export interface CadenceParseContext<
	TAnchor extends string = string,
	TUnit extends string = string,
> {
	readonly rawText: string;
	workingText: string;
	isConditional: boolean;
	conditionReason: string | undefined;
	readonly diagnostics: FrequencyDiagnostic[];
	readonly config: Partial<FrequencyGrammarConfig<TAnchor, TUnit>>;
	readonly policy: FrequencyConsumerPolicy<TAnchor, TUnit>;
	readonly timeUnitAliases: Record<string, readonly string[]>;
	readonly multiplierAliases: Record<string, readonly string[]>;
	readonly frequencyAliases: Record<
		string,
		Partial<CadenceSchedule<TAnchor, TUnit>>
	>;
	readonly eventAnchorAliases: Record<string, readonly string[]>;
	readonly conditionalAliases: readonly string[];
	readonly intervalPrefixes: readonly string[];
	readonly recurrenceConnectors: readonly string[];
	readonly relativeOffsetConnectors: Partial<
		Record<"before" | "after" | "at" | "with", readonly string[]>
	>;
	readonly conditionConnectors: readonly string[];
	resolveTimeUnit(raw: string): TUnit | undefined;
	resolveMultiplier(raw: string): number | undefined;
}

export function createParseContext<
	TAnchor extends string = string,
	TUnit extends string = string,
>(
	input: string,
	config: Partial<FrequencyGrammarConfig<TAnchor, TUnit>>,
	policy: FrequencyConsumerPolicy<TAnchor, TUnit>,
): CadenceParseContext<TAnchor, TUnit> {
	const diagnostics: FrequencyDiagnostic[] = [];
	const timeUnitAliases = (config.timeUnitAliases ?? {}) as Record<
		string,
		readonly string[]
	>;
	const multiplierAliases = config.multiplierAliases ?? {};
	const frequencyAliases = (config.frequencyAliases ?? {}) as Record<
		string,
		Partial<CadenceSchedule<TAnchor, TUnit>>
	>;
	const eventAnchorAliases = (config.eventAnchorAliases ?? {}) as Record<
		string,
		readonly string[]
	>;
	const conditionalAliases = config.conditionalAliases ?? [];
	const intervalPrefixes = config.intervalPrefixes ?? [];
	const recurrenceConnectors = config.recurrenceConnectors ?? [];
	const relativeOffsetConnectors = config.relativeOffsetConnectors ?? {};
	const conditionConnectors = config.conditionConnectors ?? [];

	const resolveTimeUnit = (raw: string): TUnit | undefined => {
		const lower = raw.toLocaleLowerCase(config.locales as string).trim();
		for (const [canonical, aliases] of Object.entries(timeUnitAliases)) {
			if (
				canonical.toLocaleLowerCase(config.locales as string) === lower ||
				aliases.some(
					(a) => a.toLocaleLowerCase(config.locales as string) === lower,
				)
			) {
				return canonical as TUnit;
			}
		}
		return undefined;
	};

	const resolveMultiplier = (raw: string): number | undefined => {
		const num = Number(raw);
		if (!Number.isNaN(num) && num > 0) return num;
		const lower = raw.toLocaleLowerCase(config.locales as string).trim();
		for (const [countStr, aliases] of Object.entries(multiplierAliases)) {
			if (
				aliases.some(
					(a) => a.toLocaleLowerCase(config.locales as string) === lower,
				)
			) {
				return Number(countStr);
			}
		}
		return undefined;
	};

	return {
		rawText: input.trim(),
		workingText: input.trim(),
		isConditional: false,
		conditionReason: undefined,
		diagnostics,
		config,
		policy,
		timeUnitAliases,
		multiplierAliases,
		frequencyAliases,
		eventAnchorAliases,
		conditionalAliases,
		intervalPrefixes,
		recurrenceConnectors,
		relativeOffsetConnectors,
		conditionConnectors,
		resolveTimeUnit,
		resolveMultiplier,
	};
}
