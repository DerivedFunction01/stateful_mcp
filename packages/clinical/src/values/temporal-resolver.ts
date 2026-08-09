import type {
	ClinicalDateRange,
	TemporalBoundary,
	TimePrecisionLevel,
} from "../schemas/schemas-interface/time";
import type {
	TemporalAnchor,
	TemporalExpression,
	TemporalResolveResult,
} from "./temporal-expression";

export function resolveTemporalExpression(
	expression: TemporalExpression,
	anchor: TemporalAnchor,
): TemporalResolveResult {
	const reference = new Date(anchor.referenceInstant);
	if (Number.isNaN(reference.getTime()))
		return {
			diagnostics: [
				{
					code: "invalid_anchor",
					message: "Temporal anchor referenceInstant is invalid",
				},
			],
		};
	try {
		return {
			value: resolve(expression, reference, anchor.timezone),
			diagnostics: [],
		};
	} catch (error) {
		return {
			diagnostics: [
				{
					code: "invalid_expression",
					message: error instanceof Error ? error.message : String(error),
				},
			],
		};
	}
}

function resolve(
	expression: TemporalExpression,
	reference: Date,
	timezone: string,
): ClinicalDateRange {
	switch (expression.kind) {
		case "date_range":
			return expression.value;
		case "absolute_instant":
			return {
				time: {
					startDatetime: boundary(expression.instant, expression.precision),
					endDatetime: boundary(expression.instant, expression.precision),
				},
			};
		case "relative":
			return {
				relativeEstimate: {
					direction: expression.direction,
					firstValue: expression.amount,
					secondValue: expression.upperAmount,
					precisionUnit: expression.unit,
				},
			};
		case "relative_day": {
			const start = zonedDayStart(reference, timezone, expression.offsetDays);
			const end = zonedDayStart(reference, timezone, expression.offsetDays + 1);
			return {
				time: {
					startDatetime: boundary(start.toISOString(), "day"),
					endDatetime: boundary(end.toISOString(), "day"),
				},
			};
		}
		case "range": {
			const start = resolve(expression.start, reference, timezone).time
				?.startDatetime;
			const end = resolve(expression.end, reference, timezone).time
				?.endDatetime;
			if (!start || !end)
				throw new Error(
					"Range endpoints must resolve to absolute temporal boundaries",
				);
			if (
				new Date(start.assertedTimestampUtc) >
				new Date(end.assertedTimestampUtc)
			)
				throw new Error("Temporal range start is after its end");
			return { time: { startDatetime: start, endDatetime: end } };
		}
		case "repeat":
			return {
				time: {
					repeat: { multiplier: expression.multiplier, level: expression.unit },
				},
			};
	}
}

function boundary(
	instant: string,
	precision: TimePrecisionLevel,
): TemporalBoundary {
	return {
		assertedTimestampUtc: new Date(instant).toISOString(),
		precisionLevel: precision,
	};
}
function zonedDayStart(
	reference: Date,
	timezone: string,
	dayOffset: number,
): Date {
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone: timezone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).formatToParts(reference);
	const year = Number(parts.find((part) => part.type === "year")?.value);
	const month = Number(parts.find((part) => part.type === "month")?.value);
	const day = Number(parts.find((part) => part.type === "day")?.value);
	const localMidnight = new Date(Date.UTC(year, month - 1, day + dayOffset));
	const offset = timezoneOffsetMinutes(localMidnight, timezone);
	return new Date(localMidnight.getTime() - offset * 60_000);
}

function timezoneOffsetMinutes(value: Date, timezone: string): number {
	const parts = new Intl.DateTimeFormat("en-US", {
		timeZone: timezone,
		timeZoneName: "shortOffset",
	}).formatToParts(value);
	const offset =
		parts.find((part) => part.type === "timeZoneName")?.value ?? "GMT";
	const match = offset.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
	if (!match) return 0;
	const minutes = Number(match[2]) * 60 + Number(match[3] ?? 0);
	return match[1] === "+" ? minutes : -minutes;
}
