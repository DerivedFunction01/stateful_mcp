import type { BaseValueGrammarConfig } from "../numeric";
import type { RelativeTimeToken, ValueFormatConfig } from "../token-spec";
import type { CalendarWindowConfig, PartOfDayConfig } from "./window";

export type RelativeDirection = "past" | "future" | "current";

export type TemporalModifierKind = "previous" | "next" | "current";

export interface RelativeDisambiguationPolicy {
	/** How to resolve 'next <weekday>' when anchor is before that weekday in current week (default: 'upcoming') */
	readonly nextWeekdayPolicy?: "upcoming" | "following_week";
	/** How to resolve 'last <weekday>' when anchor is on that same weekday (default: 'previous_occurrence') */
	readonly sameDayPolicy?: "same_day" | "previous_occurrence";
	/** First day of week (0 = Sunday, 1 = Monday, etc., default: 0) */
	readonly firstDayOfWeek?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
}

export type UCUMTimeUnit =
	| "ms"
	| "s"
	| "min"
	| "h"
	| "d"
	| "wk"
	| "mo"
	| "a"
	| "yr";

export type RelativeTemporalUnit =
	| UCUMTimeUnit
	| "second"
	| "minute"
	| "hour"
	| "day"
	| "week"
	| "month"
	| "quarter"
	| "season"
	| "year"
	| "decade";

export interface RelativeTemporalSlot {
	readonly direction: RelativeDirection;
	readonly amount: number; // e.g. 3 in "3 hours ago" or 1 in "last summer"
	readonly unit: RelativeTemporalUnit;
	readonly specificQualifier?: string; // e.g. "summer" or "morning" or "Q2"
	readonly referenceYear?: number; // e.g. 2026 in "last summer in 2026"
}

export interface RelativeTemporalDefinition {
	readonly direction: RelativeDirection;
	readonly amount: number;
	readonly unit: RelativeTemporalUnit;
	readonly specificQualifier?: string;
	readonly aliases: readonly string[];
}

export interface RelativeTemporalConfig extends BaseValueGrammarConfig {
	readonly templates?: readonly (
		| ValueFormatConfig<RelativeTimeToken>
		| string
	)[];
	/** User-defined relative temporal definitions */
	readonly relativeDefinitions?: readonly RelativeTemporalDefinition[];
	/** Slot mappings for key-based aliases */
	readonly relativeSlots?: Readonly<Record<string, RelativeTemporalSlot>>;
	/** Aliases mapped to canonical slot keys */
	readonly relativeTemporalAliases?: Readonly<
		Record<string, readonly string[]>
	>;
	/** Temporal modifiers (e.g. { previous: ["last", "past", "上", "上一"], next: ["next", "下", "下一"], current: ["this", "本", "今"] }) */
	readonly temporalModifiers?: Readonly<
		Partial<Record<TemporalModifierKind, readonly string[]>>
	>;
	/** Month aliases (e.g. { "1": ["january", "jan", "一月"], ... "12": ["december", "dec", "十二月"] }) */
	readonly monthAliases?: Readonly<Record<string, readonly string[]>>;
	/** Weekday aliases (e.g. { "0": ["sunday", "sun", "周日"], "1": ["monday", "mon", "周一"], ... "6": ["saturday", "sat", "周六"] }) */
	readonly weekdayAliases?: Readonly<Record<string, readonly string[]>>;
	/** Disambiguation policies for weekdays and calendar targets */
	readonly disambiguationPolicy?: RelativeDisambiguationPolicy;
	/** Direction prefix aliases (e.g. { past: ["il y a", "vor", "ago"], future: ["in", "dans", "in"] }) */
	readonly directionPrefixes?: Readonly<
		Partial<Record<RelativeDirection, readonly string[]>>
	>;
	/** Direction postfix aliases (e.g. { past: ["ago", "назад", "以前"], future: ["from now", "plus tard", "后", "後"] }) */
	readonly directionPostfixes?: Readonly<
		Partial<Record<RelativeDirection, readonly string[]>>
	>;
	/** Unit aliases for relative time (e.g. { hour: ["hour", "hours", "h", "heures", "часа", "小时"], day: ["day", "days", "d", "jours", "дня", "天"], week: ["week", "weeks", "semaines", "недели", "周"] }) */
	readonly unitAliases?: Readonly<
		Record<RelativeTemporalUnit | string, readonly string[]>
	>;
	/** Part-of-day configuration */
	readonly partOfDayConfig?: PartOfDayConfig;
	/** Calendar window configuration */
	readonly calendarConfig?: CalendarWindowConfig;
	readonly locales?: string | readonly string[];
}
