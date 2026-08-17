import { TextAttributes } from "@opentui/core";
import { useCursorBlink } from "../hooks/useCursorBlink";
import { GlobalThemeRegistry, type TuiThemeDefinition } from "../theme";

export interface TuiCursorProps {
	readonly char?: string;
	readonly blink?: boolean;
	readonly intervalMs?: number;
	readonly isPlaceholder?: boolean;
	readonly theme?: TuiThemeDefinition;
}

/**
 * High-contrast, theme-unified character cell cursor.
 * - When visible: Renders a solid theme cursor badge (`c.cursorBg`) with high-contrast text (`c.cursorFg`).
 * - When hidden (blink off): Renders the character normally in place without layout jumping or color inversion bugs.
 */
export function TuiCursor({
	char = " ",
	blink = true,
	intervalMs = 530,
	isPlaceholder = false,
	theme,
}: TuiCursorProps) {
	const isVisible = useCursorBlink(intervalMs, blink);
	const c = (theme ?? GlobalThemeRegistry.getActive()).colors;

	if (!isVisible) {
		return (
			<text
				fg={isPlaceholder ? c.fgMuted : c.fgPrimary}
				attributes={isPlaceholder ? TextAttributes.DIM : 0}
			>
				{char}
			</text>
		);
	}

	return (
		<box backgroundColor={c.cursorBg} paddingLeft={0} paddingRight={0}>
			<text fg={c.cursorFg} attributes={TextAttributes.BOLD}>
				{char}
			</text>
		</box>
	);
}
