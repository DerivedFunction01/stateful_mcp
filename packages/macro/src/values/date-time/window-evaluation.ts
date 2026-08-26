import type {
	RelativeDisambiguationPolicy,
	RelativeTemporalSlot,
} from "./anchor";
import type {
	CalendarWindowConfig,
	MonthDayWindow,
	PartOfDayConfig,
	ResolvedTemporalWindow,
	TimeOfDayWindow,
} from "./window";
import { DEFAULT_QUARTER_WINDOWS } from "./window";

/**
 * Pure evaluation engine for anchor-relative temporal slots.
 * Evaluates prospective/retrospective offsets into exact ISO UTC intervals using 24-hr ISO tables and system anchor.
 */
export function evaluateAnchorRelativeTemporal(
	slot: RelativeTemporalSlot,
	anchorTimestampUtc: string | Date | number,
	options: {
		timeZone?: string;
		partOfDayConfig?: PartOfDayConfig;
		calendarConfig?: CalendarWindowConfig;
		disambiguationPolicy?: RelativeDisambiguationPolicy;
	} = {},
): ResolvedTemporalWindow {
	const anchorDate = new Date(anchorTimestampUtc);
	const targetTimeZone =
		options.timeZone ??
		Intl.DateTimeFormat().resolvedOptions().timeZone ??
		"UTC";

	const sign =
		slot.direction === "past" ? -1 : slot.direction === "future" ? 1 : 0;
	const amount = slot.amount * sign;

	// 1. Part of Day on anchor date (e.g. morning, afternoon, evening)
	if (slot.specificQualifier && options.partOfDayConfig?.windows) {
		const qualifierLower = slot.specificQualifier.toLocaleLowerCase();
		let matchedWindow: TimeOfDayWindow | undefined;
		for (const [key, win] of Object.entries(options.partOfDayConfig.windows)) {
			if (key.toLocaleLowerCase() === qualifierLower) {
				matchedWindow = win;
				break;
			}
		}

		if (matchedWindow) {
			const targetDate = new Date(anchorDate.getTime() + amount * 86400000);
			const yyyy = targetDate.getUTCFullYear();
			const mm = String(targetDate.getUTCMonth() + 1).padStart(2, "0");
			const dd = String(targetDate.getUTCDate()).padStart(2, "0");

			const startIso = new Date(
				`${yyyy}-${mm}-${dd}T${matchedWindow.start}:00Z`,
			).toISOString();
			const endIso = new Date(
				`${yyyy}-${mm}-${dd}T${matchedWindow.end}:00Z`,
			).toISOString();

			return {
				startIsoUtc: startIso,
				endIsoUtc: endIso,
				isInstantaneous: false,
				targetTimeZone,
			};
		}
	}

	// 2. Specific Weekday Target (e.g. "last Sunday", "next Friday")
	if (
		slot.unit === "day" &&
		slot.specificQualifier &&
		(slot.specificQualifier.startsWith("weekday_") ||
			/^(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/i.test(
				slot.specificQualifier,
			))
	) {
		let targetDay = 0;
		if (slot.specificQualifier.startsWith("weekday_")) {
			targetDay = Number(slot.specificQualifier.replace("weekday_", "")) || 0;
		} else {
			const names = [
				"sunday",
				"monday",
				"tuesday",
				"wednesday",
				"thursday",
				"friday",
				"saturday",
			];
			targetDay = names.indexOf(slot.specificQualifier.toLowerCase());
			if (targetDay < 0) targetDay = 0;
		}

		const anchorDay = anchorDate.getUTCDay();
		let dayDiff = 0;

		if (slot.direction === "future") {
			dayDiff = (targetDay - anchorDay + 7) % 7;
			if (dayDiff === 0) dayDiff = 7;
			if (
				options.disambiguationPolicy?.nextWeekdayPolicy === "following_week"
			) {
				dayDiff += 7;
			}
		} else if (slot.direction === "past") {
			dayDiff = (anchorDay - targetDay + 7) % 7;
			if (dayDiff === 0) {
				if (options.disambiguationPolicy?.sameDayPolicy !== "same_day") {
					dayDiff = 7;
				}
			}
			dayDiff = -dayDiff;
		} else {
			dayDiff = targetDay - anchorDay;
		}

		const targetDate = new Date(anchorDate.getTime() + dayDiff * 86400000);
		const yyyy = targetDate.getUTCFullYear();
		const mm = String(targetDate.getUTCMonth() + 1).padStart(2, "0");
		const dd = String(targetDate.getUTCDate()).padStart(2, "0");

		return {
			startIsoUtc: `${yyyy}-${mm}-${dd}T00:00:00.000Z`,
			endIsoUtc: `${yyyy}-${mm}-${dd}T23:59:59.999Z`,
			isInstantaneous: false,
			targetTimeZone,
		};
	}

	// 3. Calendar Month Window (e.g. "last December", "next month", "this month")
	if (slot.unit === "month") {
		let targetMonth: number;
		let targetYear = anchorDate.getUTCFullYear();
		const anchorMonth = anchorDate.getUTCMonth() + 1; // 1..12

		if (slot.specificQualifier) {
			const rawQ = slot.specificQualifier;
			const numQ = Number(rawQ);
			if (Number.isFinite(numQ) && numQ >= 1 && numQ <= 12) {
				targetMonth = numQ;
			} else {
				const monthNames = [
					"january",
					"february",
					"march",
					"april",
					"may",
					"june",
					"july",
					"august",
					"september",
					"october",
					"november",
					"december",
				];
				const idx = monthNames.indexOf(rawQ.toLowerCase());
				targetMonth = idx >= 0 ? idx + 1 : anchorMonth;
			}

			if (slot.direction === "past") {
				targetYear = targetMonth >= anchorMonth ? targetYear - 1 : targetYear;
			} else if (slot.direction === "future") {
				targetYear = targetMonth <= anchorMonth ? targetYear + 1 : targetYear;
			}
		} else {
			const rawMonth = anchorMonth + amount;
			const d = new Date(Date.UTC(targetYear, rawMonth - 1, 1));
			targetYear = d.getUTCFullYear();
			targetMonth = d.getUTCMonth() + 1;
		}

		const mm = String(targetMonth).padStart(2, "0");
		const lastDay = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
		const dd = String(lastDay).padStart(2, "0");

		return {
			startIsoUtc: `${targetYear}-${mm}-01T00:00:00.000Z`,
			endIsoUtc: `${targetYear}-${mm}-${dd}T23:59:59.999Z`,
			isInstantaneous: false,
			targetTimeZone,
		};
	}

	// 4. Calendar Week Window (e.g. "last week", "next week", "this week")
	if (slot.unit === "week" && !slot.specificQualifier) {
		const firstDay = options.disambiguationPolicy?.firstDayOfWeek ?? 0;
		const anchorDay = anchorDate.getUTCDay();
		const diffToWeekStart = ((anchorDay - firstDay + 7) % 7) * 86400000;
		const thisWeekStart = new Date(anchorDate.getTime() - diffToWeekStart);
		const targetWeekStart = new Date(
			thisWeekStart.getTime() + amount * 7 * 86400000,
		);
		const yyyy = targetWeekStart.getUTCFullYear();
		const mm = String(targetWeekStart.getUTCMonth() + 1).padStart(2, "0");
		const dd = String(targetWeekStart.getUTCDate()).padStart(2, "0");

		const targetWeekEnd = new Date(targetWeekStart.getTime() + 6 * 86400000);
		const endY = targetWeekEnd.getUTCFullYear();
		const endM = String(targetWeekEnd.getUTCMonth() + 1).padStart(2, "0");
		const endD = String(targetWeekEnd.getUTCDate()).padStart(2, "0");

		return {
			startIsoUtc: `${yyyy}-${mm}-${dd}T00:00:00.000Z`,
			endIsoUtc: `${endY}-${endM}-${endD}T23:59:59.999Z`,
			isInstantaneous: false,
			targetTimeZone,
		};
	}

	// 5. Instantaneous Unit Offsets (ms, s, min, h, d, wk) without specific window qualifier
	if (
		!slot.specificQualifier &&
		(slot.unit === "ms" ||
			slot.unit === "s" ||
			slot.unit === "second" ||
			slot.unit === "min" ||
			slot.unit === "minute" ||
			slot.unit === "h" ||
			slot.unit === "hour" ||
			slot.unit === "d" ||
			slot.unit === "day" ||
			slot.unit === "wk" ||
			slot.unit === "week")
	) {
		let msOffset = 0;
		switch (slot.unit) {
			case "ms":
				msOffset = amount;
				break;
			case "s":
			case "second":
				msOffset = amount * 1000;
				break;
			case "min":
			case "minute":
				msOffset = amount * 60 * 1000;
				break;
			case "h":
			case "hour":
				msOffset = amount * 3600 * 1000;
				break;
			case "d":
			case "day":
				msOffset = amount * 86400 * 1000;
				break;
			case "wk":
			case "week":
				msOffset = amount * 7 * 86400 * 1000;
				break;
		}

		const resultTime = new Date(anchorDate.getTime() + msOffset);
		const iso = resultTime.toISOString();
		return {
			startIsoUtc: iso,
			endIsoUtc: iso,
			isInstantaneous: true,
			targetTimeZone,
		};
	}

	// 6. Calendar Windows: Seasons / Quarters / Decades
	const refYear =
		slot.referenceYear ??
		anchorDate.getUTCFullYear() +
			(slot.unit === "year" || slot.unit === "season" || slot.unit === "quarter"
				? amount
				: 0);

	// Decade: e.g. 2020s -> 2020 to 2029
	if (slot.unit === "decade") {
		const decadeStartYear = Math.floor(refYear / 10) * 10;
		const startIso = new Date(
			`${decadeStartYear}-01-01T00:00:00.000Z`,
		).toISOString();
		const endIso = new Date(
			`${decadeStartYear + 9}-12-31T23:59:59.999Z`,
		).toISOString();
		return {
			startIsoUtc: startIso,
			endIsoUtc: endIso,
			isInstantaneous: false,
			targetTimeZone,
		};
	}

	// Season: from calendarConfig.seasons
	if (slot.specificQualifier && options.calendarConfig?.seasons) {
		const sKey = slot.specificQualifier.toLocaleLowerCase();
		let sWin: MonthDayWindow | undefined;
		for (const [key, win] of Object.entries(options.calendarConfig.seasons)) {
			if (key.toLocaleLowerCase() === sKey) {
				sWin = win;
				break;
			}
		}

		if (sWin) {
			const startYear = refYear + (sWin.startYearOffset ?? 0);
			const endYear =
				refYear +
				(sWin.endYearOffset ?? (sWin.startMonthDay > sWin.endMonthDay ? 1 : 0));
			const startIso = new Date(
				`${startYear}-${sWin.startMonthDay}T00:00:00.000Z`,
			).toISOString();
			const endIso = new Date(
				`${endYear}-${sWin.endMonthDay}T23:59:59.999Z`,
			).toISOString();
			return {
				startIsoUtc: startIso,
				endIsoUtc: endIso,
				isInstantaneous: false,
				targetTimeZone,
			};
		}
	}

	// Quarter: from calendarConfig.quarters or default
	if (
		slot.specificQualifier &&
		(slot.unit === "quarter" || /^Q[1-4]$/i.test(slot.specificQualifier))
	) {
		const qKey = slot.specificQualifier.toUpperCase() as
			| "Q1"
			| "Q2"
			| "Q3"
			| "Q4";
		const qWin =
			options.calendarConfig?.quarters?.[qKey] ?? DEFAULT_QUARTER_WINDOWS[qKey];
		if (qWin) {
			const startYear = refYear + (qWin.startYearOffset ?? 0);
			const endYear =
				refYear +
				(qWin.endYearOffset ?? (qWin.startMonthDay > qWin.endMonthDay ? 1 : 0));
			const startIso = new Date(
				`${startYear}-${qWin.startMonthDay}T00:00:00.000Z`,
			).toISOString();
			const endIso = new Date(
				`${endYear}-${qWin.endMonthDay}T23:59:59.999Z`,
			).toISOString();
			return {
				startIsoUtc: startIso,
				endIsoUtc: endIso,
				isInstantaneous: false,
				targetTimeZone,
			};
		}
	}

	// Default Year Window
	const startIso = new Date(`${refYear}-01-01T00:00:00.000Z`).toISOString();
	const endIso = new Date(`${refYear}-12-31T23:59:59.999Z`).toISOString();
	return {
		startIsoUtc: startIso,
		endIsoUtc: endIso,
		isInstantaneous: false,
		targetTimeZone,
	};
}
