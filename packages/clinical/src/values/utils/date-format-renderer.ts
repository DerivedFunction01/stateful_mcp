import type {
	ClinicalDateRange,
	TemporalBoundary,
} from "../../schemas/schemas-interface/time";
import type {
	DateTimeFormatConfig,
	DateTimeToken,
} from "./date-regex-generator";

export interface DateRenderOptions {
	mode: "absolute" | "relative" | "auto";
	relativeLabels: "never" | "when_exact" | "always";
	now?: Date;
	timeZone?: string;
	locale?: string;
	rangeSeparator?: string;
	relativeDayDisplayLabels?: Readonly<Record<string, string>>;
}

export function renderClinicalDateRange(
	range: ClinicalDateRange,
	format: DateTimeFormatConfig,
	options: DateRenderOptions,
): string {
	const start = range.time?.startDatetime;
	const end = range.time?.endDatetime;
	if (
		options.mode !== "absolute" &&
		options.relativeLabels !== "never" &&
		start
	) {
		const relative = relativeLabel(start, options);
		if (relative && (!end || sameBoundary(start, end))) return relative;
	}
	if (range.relativeEstimate) {
		const estimate = range.relativeEstimate;
		const values =
			estimate.secondValue === undefined
				? String(estimate.firstValue)
				: `${estimate.firstValue}-${estimate.secondValue}`;
		return `${values} ${estimate.precisionUnit} ${estimate.direction}`;
	}
	if (!start && !end) return "";
	if (!end) return renderBoundary(start, format, options);
	if (!start) return renderBoundary(end, format, options);
	return `${renderBoundary(start, format, options)}${options.rangeSeparator ?? " - "}${renderBoundary(end, format, options)}`;
}

function renderBoundary(
	boundary: TemporalBoundary | undefined,
	format: DateTimeFormatConfig,
	options: DateRenderOptions,
): string {
	if (!boundary) return "";
	const date = new Date(boundary.assertedTimestampUtc);
	const parts = new Intl.DateTimeFormat(
		options.locale ?? format.options?.locale ?? "en-US",
		{
			timeZone: options.timeZone ?? format.options?.timeZone ?? "UTC",
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
			hour12: false,
		},
	).formatToParts(date);
	const values = Object.fromEntries(
		parts.map((part) => [part.type, part.value]),
	);
	const tokenValue = (token: DateTimeToken): string => {
		switch (token) {
			case "YYYY":
				return values.year ?? "";
			case "YY":
				return (values.year ?? "").slice(-2);
			case "MM":
				return values.month ?? "";
			case "DD":
				return values.day ?? "";
			case "HH":
				return values.hour ?? "";
			case "min":
				return values.minute ?? "";
			case "SS":
				return values.second ?? "";
			case "ampm":
				return Number(values.hour ?? 0) >= 12 ? "PM" : "AM";
			case "tz":
				return values.timeZoneName ?? "";
			case "MM_name":
				return new Intl.DateTimeFormat(format.options?.locale ?? "en-US", {
					timeZone: options.timeZone ?? format.options?.timeZone ?? "UTC",
					month: "long",
				}).format(date);
		}
	};
	return format.tokens.reduce(
		(output, token, index) =>
			output +
			(index === 0 ? "" : (format.separators[index - 1] ?? "")) +
			tokenValue(token),
		"",
	);
}

function sameBoundary(
	left: TemporalBoundary,
	right: TemporalBoundary,
): boolean {
	return left.assertedTimestampUtc === right.assertedTimestampUtc;
}

function relativeLabel(
	boundary: TemporalBoundary,
	options: DateRenderOptions,
): string | undefined {
	const now = options.now ?? new Date();
	const zone = options.timeZone ?? "UTC";
	const formatter = new Intl.DateTimeFormat(options.locale ?? "en-CA", {
		timeZone: zone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	});
	const target = formatter.format(new Date(boundary.assertedTimestampUtc));
	const current = formatter.format(now);
	const dayOffset = Math.round(
		(Date.parse(`${target}T00:00:00Z`) - Date.parse(`${current}T00:00:00Z`)) /
			86400000,
	);
	if (
		options.relativeLabels === "when_exact" &&
		![-1, 0, 1].includes(dayOffset)
	)
		return undefined;
	return options.relativeDayDisplayLabels?.[String(dayOffset)];
}
