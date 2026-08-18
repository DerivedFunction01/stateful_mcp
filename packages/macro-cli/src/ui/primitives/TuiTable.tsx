import { type MouseEvent, TextAttributes } from "@opentui/core";
import type { I18nKernel } from "@stateful-mcp/macro";
import {
	formatNumericValue,
	type NumericFormatOptions,
} from "@stateful-mcp/macro";
import type { ReactNode } from "react";
import { translate } from "../../locales";
import { GlobalThemeRegistry, type TuiThemeDefinition } from "../theme";

export type TuiTableVariant = "modern" | "office-grid" | "zebra" | "compact";

export interface TuiTableCellCoord {
	readonly row: number;
	readonly col: number;
}

export interface TuiTableColumn<T = Record<string, unknown>> {
	readonly id: string;
	readonly header: string;
	readonly width?: number;
	readonly align?: "left" | "right" | "center";
	readonly render?: (
		item: T,
		isSelected: boolean,
		isCellSelected: boolean,
	) => ReactNode;
}

export interface TuiTableProps<T = Record<string, unknown>> {
	readonly columns: readonly TuiTableColumn<T>[];
	readonly data: readonly T[];
	readonly selectedIndex?: number;
	readonly selectedCell?: TuiTableCellCoord;
	readonly variant?: TuiTableVariant;
	readonly title?: string;
	readonly emptyMessage?: string;
	readonly theme?: TuiThemeDefinition;
	readonly i18n?: I18nKernel;
	readonly formatOptions?: NumericFormatOptions;
	readonly onSelectRow?: (index: number) => void;
	readonly onSelectCell?: (cell: TuiTableCellCoord) => void;
}

function padCell(
	content: string,
	width: number,
	align: "left" | "right" | "center" = "left",
): string {
	const len = content.length;
	if (len >= width) return content.slice(0, width);
	const diff = width - len;
	if (align === "right") return " ".repeat(diff) + content;
	if (align === "center") {
		const left = Math.floor(diff / 2);
		const right = diff - left;
		return " ".repeat(left) + content + " ".repeat(right);
	}
	return content + " ".repeat(diff);
}

export function TuiTable<T extends Record<string, unknown>>({
	columns,
	data,
	selectedIndex = -1,
	selectedCell,
	variant = "modern",
	title,
	emptyMessage,
	theme,
	onSelectRow,
	onSelectCell,
	i18n,
	formatOptions,
}: TuiTableProps<T>) {
	const c = (theme ?? GlobalThemeRegistry.getActive()).colors;
	const effectiveEmptyMessage = emptyMessage ?? translate(i18n, "table.empty");
	const formatCellValue = (value: unknown) =>
		typeof value === "number"
			? formatNumericValue(value, formatOptions)
			: String(value ?? "");

	// Resolve column widths
	const resolvedWidths = columns.map((col) => {
		if (col.width) return col.width;
		let maxLen = col.header.length;
		for (const row of data) {
			const val = formatCellValue(row[col.id]);
			if (val.length > maxLen) maxLen = val.length;
		}
		return Math.max(8, maxLen + 2);
	});

	if (data.length === 0) {
		return (
			<box padding={1}>
				<text fg={c.fgMuted} attributes={TextAttributes.DIM}>
					{effectiveEmptyMessage}
				</text>
			</box>
		);
	}

	const activeRowIdx = selectedCell ? selectedCell.row : selectedIndex;
	const handlePointer = (event: MouseEvent) => {
		if (event.button !== 0) return;
		const row = Math.max(0, Math.min(data.length - 1, Math.floor(event.y)));
		onSelectRow?.(row);
		onSelectCell?.({
			row,
			col: Math.max(0, Math.min(columns.length - 1, Math.floor(event.x / 10))),
		});
	};

	// ─── 1. OFFICE-GRID THEME (Classic MS Office / Excel Box-Drawing Grid) ─
	if (variant === "office-grid") {
		const topBorder =
			"┌" + resolvedWidths.map((w) => "─".repeat(w + 2)).join("┬") + "┐";
		const midBorder =
			"├" + resolvedWidths.map((w) => "─".repeat(w + 2)).join("┼") + "┤";
		const botBorder =
			"└" + resolvedWidths.map((w) => "─".repeat(w + 2)).join("┴") + "┘";

		return (
			<box flexDirection="column" onMouseDown={handlePointer}>
				{title && (
					<box height={1} marginBottom={1}>
						<text fg={c.accentPrimary} attributes={TextAttributes.BOLD}>
							📊 {title}
						</text>
					</box>
				)}
				{/* Top Grid Border */}
				<box height={1}>
					<text fg={c.borderActive}>{topBorder}</text>
				</box>

				{/* Header Row (Elevated Background Fill) */}
				<box flexDirection="row" height={1} backgroundColor={c.bgActive}>
					<text fg={c.borderActive}>│</text>
					{columns.map((col, idx) => {
						const width = resolvedWidths[idx]!;
						const headerStr = padCell(col.header, width, col.align);
						const isColSelected = selectedCell
							? selectedCell.col === idx
							: false;

						return (
							<box
								key={col.id}
								flexDirection="row"
								backgroundColor={isColSelected ? c.bgElevated : undefined}
							>
								<text
									fg={isColSelected ? c.accentAmber : c.accentPrimary}
									attributes={TextAttributes.BOLD}
								>
									{" "}
									{headerStr}{" "}
								</text>
								<text fg={c.borderActive}>│</text>
							</box>
						);
					})}
				</box>

				{/* Header / Body Divider */}
				<box height={1}>
					<text fg={c.borderActive}>{midBorder}</text>
				</box>

				{/* Data Rows */}
				{data.map((row, rIdx) => {
					const isRowSelected = rIdx === activeRowIdx;
					const rowBg = isRowSelected ? c.bgElevated : undefined;

					return (
						<box
							key={rIdx}
							flexDirection="row"
							height={1}
							backgroundColor={rowBg}
						>
							<text fg={c.borderActive}>│</text>
							{columns.map((col, cIdx) => {
								const width = resolvedWidths[cIdx]!;
								const rawVal = formatCellValue(row[col.id]);
								const cellStr = padCell(rawVal, width, col.align);

								const isCellSelected = selectedCell
									? selectedCell.row === rIdx && selectedCell.col === cIdx
									: false;

								const cellBg = isCellSelected
									? (c.bgSelect ?? c.accentPrimary)
									: undefined;
								const textFg = isCellSelected
									? (c.bgSelectText ?? c.fgInverse)
									: isRowSelected
										? c.fgPrimary
										: c.fgMuted;

								return (
									<box
										key={col.id}
										flexDirection="row"
										backgroundColor={cellBg}
									>
										<text
											fg={textFg}
											attributes={
												isCellSelected || isRowSelected
													? TextAttributes.BOLD
													: 0
											}
										>
											{" "}
											{cellStr}{" "}
										</text>
										<text fg={c.borderActive}>│</text>
									</box>
								);
							})}
						</box>
					);
				})}

				{/* Bottom Grid Border */}
				<box height={1}>
					<text fg={c.borderActive}>{botBorder}</text>
				</box>
			</box>
		);
	}

	// ─── 2. ZEBRA STRIPED THEME ──────────────────────────────────────────
	if (variant === "zebra") {
		return (
			<box flexDirection="column" onMouseDown={handlePointer}>
				{title && (
					<box height={1} marginBottom={1}>
						<text fg={c.fgPrimary} attributes={TextAttributes.BOLD}>
							{title}
						</text>
					</box>
				)}
				{/* Header Row */}
				<box
					flexDirection="row"
					height={1}
					backgroundColor={c.bgActive}
					paddingLeft={1}
					paddingRight={1}
				>
					{columns.map((col, idx) => {
						const width = resolvedWidths[idx]!;
						const headerStr = padCell(col.header, width, col.align);
						return (
							<text
								key={col.id}
								fg={c.accentPrimary}
								attributes={TextAttributes.BOLD}
							>
								{headerStr}
								{"  "}
							</text>
						);
					})}
				</box>

				{/* Zebra Striped Data Rows */}
				{data.map((row, rIdx) => {
					const isRowSelected = rIdx === activeRowIdx;
					const isEven = rIdx % 2 === 0;
					const rowBg = isRowSelected
						? c.bgActive
						: isEven
							? c.bgSurface
							: c.bgCanvas;
					const pillarColor = isRowSelected ? c.accentPrimary : "transparent";

					return (
						<box
							key={rIdx}
							flexDirection="row"
							height={1}
							backgroundColor={rowBg}
							paddingLeft={0}
							paddingRight={1}
						>
							<text fg={pillarColor} attributes={TextAttributes.BOLD}>
								{isRowSelected ? "▎" : " "}
							</text>
							{columns.map((col, cIdx) => {
								const width = resolvedWidths[cIdx]!;
								const rawVal = formatCellValue(row[col.id]);
								const cellStr = padCell(rawVal, width, col.align);

								const isCellSelected = selectedCell
									? selectedCell.row === rIdx && selectedCell.col === cIdx
									: false;

								const cellBg = isCellSelected ? c.accentPrimary : undefined;
								const textFg = isCellSelected
									? c.fgInverse
									: isRowSelected
										? c.fgPrimary
										: c.fgMuted;

								return (
									<box key={col.id} backgroundColor={cellBg} marginRight={1}>
										<text
											fg={textFg}
											attributes={
												isCellSelected || isRowSelected
													? TextAttributes.BOLD
													: 0
											}
										>
											{cellStr}
										</text>
									</box>
								);
							})}
						</box>
					);
				})}
			</box>
		);
	}

	// ─── 3. COMPACT MINIMAL THEME ─────────────────────────────────────────
	if (variant === "compact") {
		return (
			<box flexDirection="column" onMouseDown={handlePointer}>
				{/* Header */}
				<box flexDirection="row" height={1}>
					{columns.map((col, idx) => {
						const width = resolvedWidths[idx]!;
						const headerStr = padCell(col.header, width, col.align);
						return (
							<text key={col.id} fg={c.fgDim} attributes={TextAttributes.DIM}>
								{headerStr}
								{"  "}
							</text>
						);
					})}
				</box>
				{/* Rows */}
				{data.map((row, rIdx) => {
					const isRowSelected = rIdx === activeRowIdx;
					return (
						<box key={rIdx} flexDirection="row" height={1}>
							{columns.map((col, cIdx) => {
								const width = resolvedWidths[cIdx]!;
								const rawVal = formatCellValue(row[col.id]);
								const cellStr = padCell(rawVal, width, col.align);

								const isCellSelected = selectedCell
									? selectedCell.row === rIdx && selectedCell.col === cIdx
									: false;

								const textFg = isCellSelected
									? c.accentAmber
									: isRowSelected
										? c.accentPrimary
										: c.fgPrimary;

								return (
									<text
										key={col.id}
										fg={textFg}
										attributes={
											isCellSelected
												? TextAttributes.BOLD | TextAttributes.UNDERLINE
												: isRowSelected
													? TextAttributes.BOLD
													: 0
										}
									>
										{cellStr}
										{"  "}
									</text>
								);
							})}
						</box>
					);
				})}
			</box>
		);
	}

	// ─── 4. MODERN IDE THEME (Default) ────────────────────────────────────
	const totalTableWidth = resolvedWidths.reduce((a, b) => a + b + 2, 0);

	return (
		<box flexDirection="column" onMouseDown={handlePointer}>
			{title && (
				<box height={1} marginBottom={1}>
					<text fg={c.fgPrimary} attributes={TextAttributes.BOLD}>
						{title}
					</text>
				</box>
			)}
			{/* Modern Column Headers */}
			<box flexDirection="row" height={1} paddingLeft={1}>
				{columns.map((col, idx) => {
					const width = resolvedWidths[idx]!;
					const headerStr = padCell(col.header, width, col.align);
					return (
						<text
							key={col.id}
							fg={c.accentPrimary}
							attributes={TextAttributes.BOLD}
						>
							{headerStr}
							{"  "}
						</text>
					);
				})}
			</box>

			{/* Crisp Sub-header Rule */}
			<box height={1}>
				<text fg={c.borderSubtle}>
					{"─".repeat(Math.max(20, totalTableWidth))}
				</text>
			</box>

			{/* Rows with Left Focus Pillar & Cell Highlighting */}
			{data.map((row, rIdx) => {
				const isRowSelected = rIdx === activeRowIdx;
				const rowBg = isRowSelected ? c.bgActive : undefined;
				const pillar = isRowSelected ? "▎" : " ";
				const pillarFg = isRowSelected ? c.accentPrimary : "transparent";

				return (
					<box
						key={rIdx}
						flexDirection="row"
						height={1}
						backgroundColor={rowBg}
					>
						<text fg={pillarFg} attributes={TextAttributes.BOLD}>
							{pillar}
						</text>
						{columns.map((col, cIdx) => {
							const width = resolvedWidths[cIdx]!;
							const rawVal = formatCellValue(row[col.id]);
							const cellStr = padCell(rawVal, width, col.align);

							const isCellSelected = selectedCell
								? selectedCell.row === rIdx && selectedCell.col === cIdx
								: false;

							const cellBg = isCellSelected ? c.accentPrimary : undefined;
							const textFg = isCellSelected
								? c.fgInverse
								: isRowSelected
									? c.fgPrimary
									: c.fgMuted;

							return (
								<box
									key={col.id}
									backgroundColor={cellBg}
									paddingLeft={1}
									paddingRight={1}
								>
									<text
										fg={textFg}
										attributes={
											isCellSelected || isRowSelected ? TextAttributes.BOLD : 0
										}
									>
										{cellStr}
									</text>
								</box>
							);
						})}
					</box>
				);
			})}
		</box>
	);
}

// ─── RECORD DETAIL INSPECTOR MODAL ────────────────────────────────────

export interface TuiTableModalProps<T = Record<string, unknown>> {
	readonly title?: string;
	readonly record: T;
	readonly columns: readonly TuiTableColumn<T>[];
	readonly width?: number;
	readonly theme?: TuiThemeDefinition;
	readonly i18n?: I18nKernel;
	readonly onClose?: () => void;
}

export function TuiTableModal<T extends Record<string, unknown>>({
	title,
	record,
	columns,
	width = 56,
	theme,
	i18n,
	onClose,
}: TuiTableModalProps<T>) {
	const c = (theme ?? GlobalThemeRegistry.getActive()).colors;

	return (
		<box
			width={width}
			backgroundColor={c.bgSurface}
			borderStyle="single"
			borderColor={c.borderDefault}
			flexDirection="column"
			paddingLeft={2}
			paddingRight={2}
			paddingTop={1}
			paddingBottom={1}
		>
			{/* Header */}
			<box height={1} flexDirection="row" marginBottom={1}>
				<text fg={c.fgPrimary} attributes={TextAttributes.BOLD}>
					{title ?? translate(i18n, "table.recordDetail")}
				</text>
				<box flexGrow={1} />
				<text fg={c.fgMuted} attributes={TextAttributes.DIM}>
					{translate(i18n, "palette.dismissHint")}
				</text>
			</box>

			{/* Fields Matrix */}
			<box flexDirection="column" marginBottom={1}>
				{columns.map((col) => {
					const val = String(record[col.id] ?? "—");
					return (
						<box
							key={col.id}
							height={1}
							flexDirection="row"
							marginBottom={0}
							paddingLeft={1}
							paddingRight={1}
						>
							<text fg={c.accentPrimary} attributes={TextAttributes.BOLD}>
								{col.header.padEnd(16, " ")}
							</text>
							<text fg={c.fgPrimary}>{val}</text>
						</box>
					);
				})}
			</box>

			{/* Close Action */}
			<box flexDirection="row">
				<box
					backgroundColor={c.bgActive}
					paddingLeft={1}
					paddingRight={1}
					onMouseDown={(event: MouseEvent) => {
						if (event.button === 0) onClose?.();
					}}
				>
					<text fg={c.fgPrimary} attributes={TextAttributes.BOLD}>
						{translate(i18n, "modal.cancel")}
					</text>
				</box>
			</box>
		</box>
	);
}
