import { TextAttributes } from "@opentui/core";
import type { ReactNode } from "react";
import { GlobalThemeRegistry, type TuiThemeDefinition } from "../theme";
import {
	padScratchpadCell,
	type TuiScratchpadGeometry,
} from "./scratchpad-geometry";

export type TuiScratchpadLineState =
	| "normal"
	| "active"
	| "valid"
	| "invalid"
	| "pinned"
	| "selected";

export interface TuiScratchpadLineModel {
	readonly id: string;
	readonly lineNumber: string;
	readonly text: string;
	readonly sign?: string;
	readonly projection?: string;
	readonly diagnostic?: string;
	readonly state: TuiScratchpadLineState;
}

export interface TuiScratchpadLineProps {
	readonly line: TuiScratchpadLineModel;
	readonly authoredContent?: ReactNode;
	readonly projectionContent?: ReactNode;
	readonly showProjection?: boolean;
	readonly theme?: TuiThemeDefinition;
	readonly geometry?: TuiScratchpadGeometry;
}

export function TuiScratchpadLine({
	line,
	authoredContent,
	projectionContent,
	showProjection = true,
	theme,
	geometry,
}: TuiScratchpadLineProps) {
	const c = (theme ?? GlobalThemeRegistry.getActive()).colors;
	const isActive = line.state === "active" || line.state === "selected";
	const hasError = line.state === "invalid" || Boolean(line.diagnostic);
	const isValid = line.state === "valid";
	const rowBg = isActive ? c.bgActive : undefined;
	const accentColor = hasError
		? c.statusError
		: isActive || line.state === "pinned"
			? c.accentPrimary
			: "transparent";
	const signColor = hasError
		? c.statusError
		: isActive
			? c.accentPrimary
			: isValid
				? c.statusSuccess
				: c.fgMuted;
	const sign =
		line.sign ?? (hasError ? "!" : isActive ? "●" : isValid ? "✓" : " ");
	const metrics = geometry ?? {
		markerWidth: 1,
		signWidth: 3,
		lineNumberWidth: Math.max(1, line.lineNumber.length),
		separatorWidth: 2,
		contentStartColumn: 1 + 3 + Math.max(1, line.lineNumber.length) + 1 + 2,
		authoredRowHeight: 1,
		projectionRowHeight: showProjection ? 1 : 0,
	};
	const marker = isActive || hasError ? "▎" : " ";
	const gutter = `${padScratchpadCell(marker, metrics.markerWidth)}${padScratchpadCell(` ${sign} `, metrics.signWidth)}${padScratchpadCell(line.lineNumber, metrics.lineNumberWidth)} │ `;
	const projectionGutter = `${padScratchpadCell(marker, metrics.markerWidth)}${" ".repeat(metrics.signWidth + metrics.lineNumberWidth + 1)}│ `;

	return (
		<box flexDirection="column">
			<box flexDirection="row" backgroundColor={rowBg} height={1}>
				<text fg={accentColor} attributes={TextAttributes.BOLD}>
					{gutter.slice(0, metrics.markerWidth)}
				</text>
				<text fg={signColor} attributes={TextAttributes.BOLD}>
					{gutter.slice(
						metrics.markerWidth,
						metrics.markerWidth + metrics.signWidth,
					)}
				</text>
				<text
					fg={isActive ? c.accentAmber : c.fgMuted}
					attributes={isActive ? TextAttributes.BOLD : 0}
				>
					{gutter.slice(
						metrics.markerWidth + metrics.signWidth,
						metrics.markerWidth +
							metrics.signWidth +
							metrics.lineNumberWidth +
							1,
					)}
				</text>
				<text fg={c.borderDefault}>│ </text>
				{authoredContent ?? (
					<text
						fg={isActive ? c.fgPrimary : c.fgSecondary}
						attributes={isActive ? TextAttributes.BOLD : 0}
					>
						{line.text || " "}
					</text>
				)}
			</box>

			{showProjection && (
				<box flexDirection="row" backgroundColor={rowBg} height={1}>
					<text fg={accentColor} attributes={TextAttributes.BOLD}>
						{projectionGutter.slice(0, metrics.markerWidth)}
					</text>
					<text fg="transparent">
						{projectionGutter.slice(
							metrics.markerWidth,
							metrics.markerWidth +
								metrics.signWidth +
								metrics.lineNumberWidth +
								1,
						)}
					</text>
					<text fg={c.borderDefault}>│ </text>
					{projectionContent ?? (
						<text
							fg={
								hasError
									? c.statusError
									: line.projection
										? isValid
											? c.statusSuccess
											: c.statusWarning
										: c.fgMuted
							}
							attributes={
								line.projection || line.diagnostic ? 0 : TextAttributes.DIM
							}
						>
							{line.diagnostic
								? `! ${line.diagnostic}`
								: line.projection
									? `↳ ${line.projection}`
									: " "}
						</text>
					)}
				</box>
			)}
		</box>
	);
}
