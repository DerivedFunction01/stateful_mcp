import { type MouseEvent, TextAttributes } from "@opentui/core";
import {
	type DateTimeFormatConfig,
	formatDateTimeValue,
	type I18nKernel,
	translate,
} from "@stateful-mcp/macro";
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
	readonly dateFormat?: DateTimeFormatConfig;
	readonly i18n?: I18nKernel;
	readonly onOpenChange?: (open: boolean) => void;
	readonly onCursorDateChange?: (date: TuiDatePickerDate) => void;
	readonly onSelectDate?: (date: TuiDatePickerDate) => void;
	readonly onMonthChange?: (year: number, month: number) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getDaysInMonth(year: number, month: number): number {
	return new Date(year, month, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number): number {
	return new Date(year, month - 1, 1).getDay();
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
	dateFormat,
	i18n,
	onOpenChange,
	onCursorDateChange,
	onSelectDate,
	onMonthChange,
}: TuiDatePickerProps) {
	const c = (theme ?? GlobalThemeRegistry.getActive()).colors;
	const borderColor = isFocused || isOpen ? c.borderActive : c.borderDefault;
	const triggerBg = isOpen ? c.bgElevated : c.bgSurface;
	const locale = dateFormat?.options?.locale;
	const formatDate = (date: TuiDatePickerDate) =>
		dateFormat
			? formatDateTimeValue(date, dateFormat)
			: new Intl.DateTimeFormat(locale, { dateStyle: "short" }).format(
					new Date(date.year, date.month - 1, date.day),
				);
	const placeholder = translate(i18n, "datePicker.placeholder");
	const today = new Date();

	// Display date in trigger
	const displayText = value ? formatDate(value) : placeholder;
	const displayFg = value ? c.fgPrimary : c.fgDim;

	// ── SEGMENTS variant: spin-box year / month / day fields ─────────────────
	if (variant === "segments") {
		const year = value?.year ?? today.getFullYear();
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
			onMouseDown={(event: MouseEvent) => {
				if (event.button === 0) onOpenChange?.(!isOpen);
			}}
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
	const viewDate = cursorDate ??
		value ?? {
			year: today.getFullYear(),
			month: today.getMonth() + 1,
			day: today.getDate(),
		};
	const { year, month } = viewDate;
	const daysInMonth = getDaysInMonth(year, month);
	const firstDayOfWeek =
		dateFormat?.options?.firstDayOfWeek ??
		(locale?.toLowerCase().startsWith("en-us") ? 0 : 1);
	const firstDay = (getFirstDayOfMonth(year, month) - firstDayOfWeek + 7) % 7;
	const monthName = new Intl.DateTimeFormat(locale, {
		month: "long",
		year: "numeric",
	}).format(new Date(year, month - 1, 1));
	const dayNames = Array.from({ length: 7 }, (_, index) =>
		new Intl.DateTimeFormat(locale, { weekday: "short" }).format(
			new Date(2024, 0, 7 + ((firstDayOfWeek + index) % 7)),
		),
	);
	const selectDay = (day: number) => {
		const date = { year, month, day };
		onCursorDateChange?.(date);
		onSelectDate?.(date);
	};
	const dayMouseProps = (day: number) => ({
		onMouseDown: (event: MouseEvent) => {
			if (event.button === 0) selectDay(day);
		},
	});

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
			borderColor={c.borderDefault}
			backgroundColor={c.bgSurface}
			paddingLeft={2}
			paddingRight={2}
			paddingTop={1}
			paddingBottom={1}
			marginTop={1}
		>
			{/* Modal Header: Title + Dismiss Hint */}
			<box height={1} flexDirection="row" marginBottom={1}>
				<text fg={c.fgPrimary} attributes={TextAttributes.BOLD}>
					{translate(i18n, "datePicker.title")}
				</text>
				<box flexGrow={1} />
				<text fg={c.fgMuted} attributes={TextAttributes.DIM}>
					{translate(i18n, "palette.dismissHint")}
				</text>
			</box>

			{/* Quick Preset Shortcuts */}
			<box flexDirection="row" marginBottom={1}>
				{[
					{
						label: translate(i18n, "datePicker.today"),
						date: {
							year: today.getFullYear(),
							month: today.getMonth() + 1,
							day: today.getDate(),
						},
					},
					{
						label: translate(i18n, "datePicker.yesterday"),
						date: {
							year: today.getFullYear(),
							month: today.getMonth() + 1,
							day: Math.max(1, today.getDate() - 1),
						},
					},
					{
						label: translate(i18n, "datePicker.thisMonth"),
						date: {
							year: today.getFullYear(),
							month: today.getMonth() + 1,
							day: 1,
						},
					},
				].map((preset) => (
					<box
						key={preset.label}
						backgroundColor={c.bgActive}
						paddingLeft={1}
						paddingRight={1}
						marginRight={1}
						onMouseDown={(event: MouseEvent) => {
							if (event.button === 0) {
								onCursorDateChange?.(preset.date);
								onSelectDate?.(preset.date);
								onOpenChange?.(false);
							}
						}}
					>
						<text fg={c.fgSecondary} attributes={TextAttributes.DIM}>
							{preset.label}
						</text>
					</box>
				))}
			</box>

			{/* Month/Year Navigation Header */}
			<box
				flexDirection="row"
				height={1}
				marginTop={0}
				onMouseDown={(event: MouseEvent) => {
					if (event.button !== 0) return;
					const previous = event.x < 3;
					const nextMonth = month + (previous ? -1 : 1);
					const normalizedMonth =
						nextMonth < 1 ? 12 : nextMonth > 12 ? 1 : nextMonth;
					const normalizedYear =
						month + (previous ? -1 : 1) < 1
							? year - 1
							: month + (previous ? -1 : 1) > 12
								? year + 1
								: year;
					onMonthChange?.(normalizedYear, normalizedMonth);
				}}
			>
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
				{dayNames.map((d, i) => {
					const weekday = (firstDayOfWeek + i) % 7;
					const isWeekend = weekday === 0 || weekday === 6;
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
									{"    "}
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

						const dayStr = String(day).padStart(3, " ");

						if (isSelected || isRangeEnd) {
							return (
								<box
									key={dIdx}
									backgroundColor={c.accentPrimary}
									paddingRight={1}
									{...dayMouseProps(day)}
								>
									<text fg={c.fgInverse} attributes={TextAttributes.BOLD}>
										{dayStr}
									</text>
								</box>
							);
						}
						if (isCursor) {
							return (
								<box
									key={dIdx}
									backgroundColor={c.bgActive}
									paddingRight={1}
									{...dayMouseProps(day)}
								>
									<text fg={c.fgPrimary} attributes={TextAttributes.BOLD}>
										{dayStr}
									</text>
								</box>
							);
						}
						if (isInRange) {
							return (
								<box
									key={dIdx}
									backgroundColor={c.bgHover}
									paddingRight={1}
									{...dayMouseProps(day)}
								>
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
									{...dayMouseProps(day)}
								>
									{dayStr}{" "}
								</text>
							);
						}

						return (
							<text
								key={dIdx}
								fg={isWeekend ? c.accentPeach : c.fgSecondary}
								{...dayMouseProps(day)}
							>
								{dayStr}{" "}
							</text>
						);
					})}
				</box>
			))}

			{/* Footer: keyboard hints */}
			<box height={1} marginTop={1}>
				<text fg={c.borderSubtle}>{"─".repeat(Math.max(20, width - 4))}</text>
			</box>
			<box height={1}>
				<text fg={c.fgDim} attributes={TextAttributes.DIM}>
					{translate(i18n, "datePicker.keyboardHints")}
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
		<box flexDirection="column" width={isOpen ? 56 : width}>
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
