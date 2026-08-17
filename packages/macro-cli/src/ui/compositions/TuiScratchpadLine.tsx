import { TextAttributes } from "@opentui/core";
import type { ReactNode } from "react";
import { GlobalThemeRegistry, type TuiThemeDefinition } from "../theme";

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
}

export function TuiScratchpadLine({
	line,
	authoredContent,
	projectionContent,
	showProjection = true,
	theme,
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

	return (
		<box flexDirection="column">
			<box flexDirection="row" backgroundColor={rowBg} height={1}>
				<text fg={accentColor} attributes={TextAttributes.BOLD}>
					{isActive || hasError ? "▎" : " "}
				</text>
				<text fg={signColor} attributes={TextAttributes.BOLD}>
					{" "}
					{sign}{" "}
				</text>
				<text
					fg={isActive ? c.accentAmber : c.fgMuted}
					attributes={isActive ? TextAttributes.BOLD : 0}
				>
					{line.lineNumber}{" "}
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
						{isActive || hasError ? "▎" : " "}
					</text>
					<text fg="transparent"> </text>
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
