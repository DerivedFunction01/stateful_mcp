import type { TuiScratchpadLineModel } from "./TuiScratchpadLine";

export interface TuiScratchpadGeometry {
	readonly markerWidth: number;
	readonly signWidth: number;
	readonly lineNumberWidth: number;
	readonly separatorWidth: number;
	readonly contentStartColumn: number;
	readonly authoredRowHeight: number;
	readonly projectionRowHeight: number;
}

export function createScratchpadGeometry(
	lines: readonly TuiScratchpadLineModel[],
	showProjection = true,
): TuiScratchpadGeometry {
	const lineNumberWidth = Math.max(
		1,
		...lines.map((line) => Math.max(1, line.lineNumber.length)),
	);
	const markerWidth = 1;
	const signWidth = 3;
	const separatorWidth = 2;
	return {
		markerWidth,
		signWidth,
		lineNumberWidth,
		separatorWidth,
		contentStartColumn:
			markerWidth + signWidth + lineNumberWidth + 1 + separatorWidth,
		authoredRowHeight: 1,
		projectionRowHeight: showProjection ? 1 : 0,
	};
}

export function padScratchpadCell(value: string, width: number): string {
	const content = value.slice(0, width);
	return content + " ".repeat(Math.max(0, width - content.length));
}

export function scratchpadLineAtY(
	geometry: TuiScratchpadGeometry,
	viewportOffset: number,
	y: number,
): number {
	const rowHeight = geometry.authoredRowHeight + geometry.projectionRowHeight;
	return Math.max(
		0,
		viewportOffset + Math.floor(Math.max(0, y) / Math.max(1, rowHeight)),
	);
}

export function clampScratchpadLine(line: number, lineCount: number): number {
	return Math.max(0, Math.min(Math.max(0, lineCount - 1), Math.floor(line)));
}

export function scratchpadColumnAtX(
	geometry: TuiScratchpadGeometry,
	x: number,
): number {
	return Math.max(0, Math.floor(x) - geometry.contentStartColumn);
}
