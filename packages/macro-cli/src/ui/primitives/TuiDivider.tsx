import { TextAttributes } from "@opentui/core";
import { GlobalThemeRegistry, type TuiThemeDefinition } from "../theme";

export interface TuiDividerProps {
	readonly direction?: "horizontal" | "vertical";
	readonly label?: string;
	readonly length?: number;
	readonly style?: "single" | "double" | "ascii" | "upper";
	readonly theme?: TuiThemeDefinition;
}

export function TuiDivider({
	direction = "horizontal",
	label,
	length,
	style = "single",
	theme,
}: TuiDividerProps) {
	const c = (theme ?? GlobalThemeRegistry.getActive()).colors;
	const char =
		style === "double"
			? "═"
			: style === "upper"
				? "▔"
				: style === "ascii"
					? "-"
					: "─";
	const vertChar = style === "double" ? "║" : style === "ascii" ? "|" : "│";

	if (direction === "vertical") {
		const h = length ?? 1;
		return (
			<box flexDirection="column" width={1} height={h}>
				{Array.from({ length: h }).map((_, i) => (
					<text key={i} fg={c.borderDefault}>
						{vertChar}
					</text>
				))}
			</box>
		);
	}

	if (label) {
		const lineLen = Math.max(2, (length ?? 32) - label.length - 4);
		const left = char.repeat(2);
		const right = char.repeat(lineLen);
		return (
			<box height={1} flexDirection="row">
				<text fg={c.borderSubtle}>{left} </text>
				<text fg={c.accentPrimary} attributes={TextAttributes.BOLD}>
					{label}
				</text>
				<text fg={c.borderSubtle}> {right}</text>
			</box>
		);
	}

	const len = length ?? 40;
	return (
		<box height={1}>
			<text fg={c.borderSubtle}>{char.repeat(len)}</text>
		</box>
	);
}
