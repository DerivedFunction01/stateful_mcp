import { TextAttributes } from "@opentui/core";
import { GlobalThemeRegistry, type TuiThemeDefinition } from "../theme";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TuiDatePickerDate {
	readonly year: number;
	/** 1-indexed (January = 1) */
	readonly month: number;
	/** 1-indexed */
	readonly day: number;
}

export type TuiDatePickerVariant = "calendar" | "inline" | "segments";

export interface TuiDatePickerProps {
	/** Currently selected date */
	readonly value?: TuiDatePickerDate;
	/** Highlighted/hover cursor date within the open calendar */
	readonly cursorDate?: TuiDatePickerDate;
	/** Label rendered above the control */
	readonly label?: string;
	/** Whether the calendar popover is open */
	readonly isOpen?: boolean;
	/** Whether the control has keyboard focus */
	readonly isFocused?: boolean;
	/** Visual variant */
	readonly variant?: TuiDatePickerVariant;
	/** Width of the control */
	readonly width?: number;
	/** Optional date range end (highlight range between value → rangeEnd) */
	readonly rangeEnd?: TuiDatePickerDate;
	/** Theme override */
	readonly theme?: TuiThemeDefinition;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
	"January",
	"February",
	"March",
	"April",
	"May",
	"June",
	"July",
	"August",
	"September",
	"October",
	"November",
	"December",
];

const DAY_NAMES = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function getDaysInMonth(year: number, month: number): number {
	return new Date(year, month, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number): number {
	return new Date(year, month - 1, 1).getDay();
}

function formatDate(date: TuiDatePickerDate): string {
	const mm = String(date.month).padStart(2, "0");
	const dd = String(date.day).padStart(2, "0");
	return `${date.year}-${mm}-${dd}`;
}

function datesEqual(a: TuiDatePickerDate, b: TuiDatePickerDate): boolean {
	return a.year === b.year && a.month === b.month && a.day === b.day;
}

function dateInRange(
	date: TuiDatePickerDate,
	start: TuiDatePickerDate,
	end: TuiDatePickerDate,
): boolean {
	const d = date.year * 10000 + date.month * 100 + date.day;
	const s = start.year * 10000 + start.month * 100 + start.day;
	const e = end.year * 10000 + end.month * 100 + end.day;
	return d >= s && d <= e;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function TuiDatePicker({
	value,
	cursorDate,
	label,
	isOpen = false,
	isFocused = false,
	variant = "calendar",
	width = 36,
	rangeEnd,
	theme,
}: TuiDatePickerProps) {
	const c = (theme ?? GlobalThemeRegistry.getActive()).colors;
	const borderColor = isFocused || isOpen ? c.borderActive : c.borderDefault;
	const triggerBg = isOpen ? c.bgElevated : c.bgSurface;

	// Display date in trigger
	const displayText = value ? formatDate(value) : "YYYY-MM-DD";
	const displayFg = value ? c.fgPrimary : c.fgDim;

	// ── SEGMENTS variant: spin-box year / month / day fields ─────────────────
	if (variant === "segments") {
		const year = value?.year ?? 2025;
		const month = value?.month ?? 1;
		const day = value?.day ?? 1;
		const activeField = isFocused ? "day" : "none"; // in real usage, tracked in parent state

		const renderSegment = (val: string, active: boolean, fg: string) => (
			<box
				borderStyle="single"
				borderColor={active ? c.borderActive : c.borderDefault}
				backgroundColor={active ? c.bgElevated : c.bgSurface}
				paddingLeft={1}
				paddingRight={1}
			>
				<text
					fg={active ? c.fgPrimary : fg}
					attributes={active ? TextAttributes.BOLD : 0}
				>
					{val}
				</text>
				{active && (
					<text fg={c.accentPrimary} attributes={TextAttributes.BOLD}>
						{" "}
						↕
					</text>
				)}
			</box>
		);

		return (
			<box flexDirection="column" width={width}>
				{label && (
					<box height={1}>
						<text
							fg={isFocused ? c.accentPrimary : c.fgSecondary}
							attributes={TextAttributes.BOLD}
						>
							{label}
						</text>
					</box>
				)}
				<box flexDirection="row" height={1}>
					{renderSegment(String(year), false, c.fgSecondary)}
					<text fg={c.fgDim}> - </text>
					{renderSegment(String(month).padStart(2, "0"), false, c.fgSecondary)}
					<text fg={c.fgDim}> - </text>
					{renderSegment(
						String(day).padStart(2, "0"),
						isFocused,
						c.fgSecondary,
					)}
				</box>
			</box>
		);
	}

	// ── Trigger control (shared for calendar & inline) ────────────────────────
	const trigger = (
		<box
			borderStyle="single"
			borderColor={borderColor}
			backgroundColor={triggerBg}
			flexDirection="row"
			paddingLeft={1}
			paddingRight={1}
		>
			<text fg={c.fgMuted}>📅 </text>
			<text
				fg={displayFg}
				attributes={value ? TextAttributes.BOLD : TextAttributes.DIM}
			>
				{displayText}
			</text>
			{rangeEnd && value && (
				<>
					<text fg={c.fgDim}> → </text>
					<text fg={c.accentAmber} attributes={TextAttributes.BOLD}>
						{formatDate(rangeEnd)}
					</text>
				</>
			)}
			<text fg={c.fgDim} attributes={TextAttributes.DIM}>
				{"  "}
			</text>
			<text fg={isFocused || isOpen ? c.accentPrimary : c.fgMuted}>
				{isOpen ? "▲" : "▼"}
			</text>
		</box>
	);

	if (!isOpen && variant === "calendar") {
		return (
			<box flexDirection="column" width={width}>
				{label && (
					<box height={1}>
						<text
							fg={isFocused ? c.accentPrimary : c.fgSecondary}
							attributes={TextAttributes.BOLD}
						>
							{label}
						</text>
					</box>
				)}
				{trigger}
			</box>
		);
	}

	// ── Calendar grid ─────────────────────────────────────────────────────────
	const viewDate = cursorDate ?? value ?? { year: 2025, month: 8, day: 1 };
	const { year, month } = viewDate;
	const daysInMonth = getDaysInMonth(year, month);
	const firstDay = getFirstDayOfMonth(year, month); // 0=Sun
	const monthName = MONTH_NAMES[month - 1] ?? "";

	// Build calendar grid rows (6 weeks max)
	const calendarCells: Array<number | null> = [
		...Array.from({ length: firstDay }, () => null),
		...Array.from({ length: daysInMonth }, (_, i) => i + 1),
	];
	// Pad to full 6-week grid
	while (calendarCells.length % 7 !== 0) calendarCells.push(null);

	const calendarRows: Array<Array<number | null>> = [];
	for (let i = 0; i < calendarCells.length; i += 7) {
		calendarRows.push(calendarCells.slice(i, i + 7));
	}

	const renderCalendar = () => (
		<box
			flexDirection="column"
			borderStyle="single"
			borderColor={c.borderActive}
			backgroundColor={c.bgElevated}
			paddingLeft={1}
			paddingRight={1}
		>
			{/* Month/Year Navigation Header */}
			<box flexDirection="row" height={1} marginTop={0}>
				<text fg={c.accentPrimary} attributes={TextAttributes.BOLD}>
					◀{" "}
				</text>
				<text fg={c.fgPrimary} attributes={TextAttributes.BOLD}>
					{monthName} {year}
				</text>
				<text fg={c.accentPrimary} attributes={TextAttributes.BOLD}>
					{" "}
					▶
				</text>
			</box>

			{/* Sub-header rule */}
			<box height={1}>
				<text fg={c.borderSubtle}>{"─".repeat(Math.max(20, width - 4))}</text>
			</box>

			{/* Day-of-week headers */}
			<box flexDirection="row" height={1}>
				{DAY_NAMES.map((d, i) => {
					const isWeekend = i === 0 || i === 6;
					return (
						<text
							key={d}
							fg={isWeekend ? c.statusWarning : c.fgMuted}
							attributes={TextAttributes.DIM}
						>
							{d + " "}
						</text>
					);
				})}
			</box>

			{/* Calendar rows */}
			{calendarRows.map((row, rIdx) => (
				<box key={rIdx} flexDirection="row" height={1}>
					{row.map((day, dIdx) => {
						if (!day) {
							return (
								<text key={dIdx} fg="transparent">
									{"   "}
								</text>
							);
						}

						const thisDate: TuiDatePickerDate = { year, month, day };
						const isSelected = value ? datesEqual(thisDate, value) : false;
						const isCursor = cursorDate
							? datesEqual(thisDate, cursorDate)
							: false;
						const isRangeEnd = rangeEnd
							? datesEqual(thisDate, rangeEnd)
							: false;
						const isInRange =
							value && rangeEnd
								? dateInRange(thisDate, value, rangeEnd)
								: false;
						const isWeekend = dIdx === 0 || dIdx === 6;
						const isToday =
							day === new Date().getDate() &&
							month === new Date().getMonth() + 1 &&
							year === new Date().getFullYear();

						const dayStr = String(day).padStart(2, " ");

						if (isSelected || isRangeEnd) {
							return (
								<box
									key={dIdx}
									backgroundColor={c.accentPrimary}
									marginRight={1}
								>
									<text fg={c.fgInverse} attributes={TextAttributes.BOLD}>
										{dayStr}
									</text>
								</box>
							);
						}
						if (isCursor) {
							return (
								<box key={dIdx} backgroundColor={c.bgActive} marginRight={1}>
									<text fg={c.fgPrimary} attributes={TextAttributes.BOLD}>
										{dayStr}
									</text>
								</box>
							);
						}
						if (isInRange) {
							return (
								<box key={dIdx} backgroundColor={c.bgHover} marginRight={1}>
									<text fg={c.accentPrimary}>{dayStr}</text>
								</box>
							);
						}
						if (isToday) {
							return (
								<text
									key={dIdx}
									fg={c.accentAmber}
									attributes={TextAttributes.BOLD}
								>
									{dayStr}{" "}
								</text>
							);
						}

						return (
							<text key={dIdx} fg={isWeekend ? c.accentPeach : c.fgSecondary}>
								{dayStr}{" "}
							</text>
						);
					})}
				</box>
			))}

			{/* Footer: keyboard hints */}
			<box height={1} marginTop={0}>
				<text fg={c.borderSubtle}>{"─".repeat(Math.max(20, width - 4))}</text>
			</box>
			<box height={1}>
				<text fg={c.fgDim} attributes={TextAttributes.DIM}>
					hjkl Move Enter Select [ ] Months Esc Close
				</text>
			</box>
		</box>
	);

	// ── INLINE variant: always shows calendar, no trigger ────────────────────
	if (variant === "inline") {
		return (
			<box flexDirection="column" width={width}>
				{label && (
					<box height={1}>
						<text
							fg={isFocused ? c.accentPrimary : c.fgSecondary}
							attributes={TextAttributes.BOLD}
						>
							{label}
						</text>
					</box>
				)}
				{renderCalendar()}
			</box>
		);
	}

	// ── CALENDAR variant: trigger + popover ──────────────────────────────────
	return (
		<box flexDirection="column" width={width}>
			{label && (
				<box height={1}>
					<text
						fg={isFocused ? c.accentPrimary : c.fgSecondary}
						attributes={TextAttributes.BOLD}
					>
						{label}
					</text>
				</box>
			)}
			{trigger}
			{isOpen && renderCalendar()}
		</box>
	);
}
