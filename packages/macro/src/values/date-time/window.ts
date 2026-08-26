export interface TimeOfDayWindow {
	/** 24-hr ISO time start (e.g. "06:00") */
	readonly start: string;
	/** 24-hr ISO time end (e.g. "12:00") */
	readonly end: string;
}

export interface PartOfDayConfig {
	/** 24-hr ISO windows for parts of day */
	readonly windows?: Readonly<Record<string, TimeOfDayWindow>>;
	/** User-defined aliases mapped to part-of-day keys */
	readonly aliases?: Readonly<Record<string, readonly string[]>>;
	readonly locales?: string | readonly string[];
}

export interface MonthDayWindow {
	/** 24-hr ISO Month-Day start (e.g. "01-01", "10-01", or "06-21") */
	readonly startMonthDay: string;
	/** 24-hr ISO Month-Day end (e.g. "03-31", "12-31", or "09-22") */
	readonly endMonthDay: string;
	/** Optional offset added to reference year for window start (e.g. -1 for US Gov Q1 relative to FY) */
	readonly startYearOffset?: number;
	/** Optional offset added to reference year for window end (e.g. +1 for seasons/quarters ending in next calendar year) */
	readonly endYearOffset?: number;
}

export interface CalendarWindowConfig {
	/** 24-hr ISO Month-Day bounds for standard quarters or custom fiscal quarters */
	readonly quarters?: Readonly<
		Record<"Q1" | "Q2" | "Q3" | "Q4" | string, MonthDayWindow>
	>;
	/** 24-hr ISO Month-Day bounds for seasons */
	readonly seasons?: Readonly<Record<string, MonthDayWindow>>;
	/** User-defined quarter aliases */
	readonly quarterAliases?: Readonly<Record<string, readonly string[]>>;
	/** User-defined season aliases */
	readonly seasonAliases?: Readonly<Record<string, readonly string[]>>;
	/** User-defined decade aliases */
	readonly decadeAliases?: Readonly<Record<string, readonly string[]>>;
	readonly locales?: string | readonly string[];
}

export interface ResolvedTemporalWindow {
	readonly startIsoUtc: string;
	readonly endIsoUtc: string;
	readonly isInstantaneous: boolean;
	readonly targetTimeZone: string;
}

/** Default 24-hr ISO windows for quarters */
export const DEFAULT_QUARTER_WINDOWS: Readonly<
	Record<"Q1" | "Q2" | "Q3" | "Q4", MonthDayWindow>
> = {
	Q1: { startMonthDay: "01-01", endMonthDay: "03-31" },
	Q2: { startMonthDay: "04-01", endMonthDay: "06-30" },
	Q3: { startMonthDay: "07-01", endMonthDay: "09-30" },
	Q4: { startMonthDay: "10-01", endMonthDay: "12-31" },
};
