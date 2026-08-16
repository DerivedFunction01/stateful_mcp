import { TextAttributes } from "@opentui/core";
import { TuiNamedColors } from "../tokens";

export interface TuiDividerProps {
	readonly direction?: "horizontal" | "vertical";
	readonly label?: string;
	readonly length?: number;
	readonly style?: "single" | "double" | "ascii";
}

export function TuiDivider({
	direction = "horizontal",
	label,
	length,
	style = "single",
}: TuiDividerProps) {
	const char = style === "double" ? "═" : style === "ascii" ? "-" : "─";
	const vertChar = style === "double" ? "║" : style === "ascii" ? "|" : "│";

	if (direction === "vertical") {
		const h = length ?? 1;
		return (
			<box flexDirection="column" width={1} height={h}>
				{Array.from({ length: h }).map((_, i) => (
					<text key={i} fg={TuiNamedColors.border}>
						{vertChar}
					</text>
				))}
			</box>
		);
	}

	if (label) {
		const lineLen = Math.max(2, (length ?? 30) - label.length - 4);
		const left = char.repeat(2);
		const right = char.repeat(lineLen);
		return (
			<box height={1}>
				<text fg={TuiNamedColors.border}>{left} </text>
				<text fg={TuiNamedColors.accent} attributes={TextAttributes.BOLD}>
					{label}
				</text>
				<text fg={TuiNamedColors.border}> {right}</text>
			</box>
		);
	}

	const len = length ?? 40;
	return (
		<box height={1}>
			<text fg={TuiNamedColors.border}>{char.repeat(len)}</text>
		</box>
	);
}
