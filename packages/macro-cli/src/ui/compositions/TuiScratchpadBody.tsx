import type { ReactNode } from "react";
import { GlobalThemeRegistry, type TuiThemeDefinition } from "../theme";
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
}

export function TuiScratchpadBody({
	lines,
	activeLineId,
	showProjections = true,
	renderAuthoredContent,
	renderProjectionContent,
	theme,
}: TuiScratchpadBodyProps) {
	const activeTheme = theme ?? GlobalThemeRegistry.getActive();

	return (
		<box
			flexDirection="column"
			flexGrow={1}
			backgroundColor={activeTheme.colors.bgCanvas}
		>
			{lines.map((line) => {
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
					/>
				);
			})}
		</box>
	);
}
