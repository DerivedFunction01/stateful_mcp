import type { MouseEvent } from "@opentui/core";
import type { ReactNode } from "react";
import { GlobalThemeRegistry, type TuiThemeDefinition } from "../theme";
import { createScratchpadGeometry } from "./scratchpad-geometry";
import {
	TuiScratchpadLine,
	type TuiScratchpadLineModel,
} from "./TuiScratchpadLine";

export interface TuiScratchpadBodyProps {
	readonly lines: readonly TuiScratchpadLineModel[];
	readonly activeLineId?: string;
	readonly showProjections?: boolean;
	readonly renderAuthoredContent?: (line: TuiScratchpadLineModel) => ReactNode;
	readonly renderProjectionContent?: (
		line: TuiScratchpadLineModel,
	) => ReactNode;
	readonly theme?: TuiThemeDefinition;
	readonly viewportOffset?: number;
	readonly viewportSize?: number;
	readonly onMouseDown?: (event: MouseEvent) => void;
	readonly onMouseDrag?: (event: MouseEvent) => void;
	readonly onMouseUp?: (event: MouseEvent) => void;
	readonly onMouseScroll?: (event: MouseEvent) => void;
}

export function TuiScratchpadBody({
	lines,
	activeLineId,
	showProjections = true,
	renderAuthoredContent,
	renderProjectionContent,
	theme,
	viewportOffset = 0,
	viewportSize,
	onMouseDown,
	onMouseDrag,
	onMouseUp,
	onMouseScroll,
}: TuiScratchpadBodyProps) {
	const activeTheme = theme ?? GlobalThemeRegistry.getActive();
	const geometry = createScratchpadGeometry(lines, showProjections);
	const visibleLines =
		viewportSize === undefined
			? lines
			: lines.slice(
					Math.max(0, viewportOffset),
					Math.max(0, viewportOffset) + Math.max(0, viewportSize),
				);

	return (
		<box
			flexDirection="column"
			flexGrow={1}
			overflow="hidden"
			backgroundColor={activeTheme.colors.bgCanvas}
			onMouseDown={onMouseDown}
			onMouseDrag={onMouseDrag}
			onMouseUp={onMouseUp}
			onMouseScroll={onMouseScroll}
		>
			{visibleLines.map((line) => {
				const resolvedLine =
					line.id === activeLineId && line.state === "normal"
						? { ...line, state: "active" as const }
						: line;
				return (
					<TuiScratchpadLine
						key={line.id}
						line={resolvedLine}
						showProjection={showProjections}
						authoredContent={renderAuthoredContent?.(resolvedLine)}
						projectionContent={renderProjectionContent?.(resolvedLine)}
						theme={theme}
						geometry={geometry}
					/>
				);
			})}
		</box>
	);
}
