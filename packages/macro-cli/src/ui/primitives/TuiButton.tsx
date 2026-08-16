import { TextAttributes } from "@opentui/core";
import { TuiNamedColors } from "../tokens";

export interface TuiButtonProps {
	readonly label: string;
	readonly isFocused?: boolean;
	readonly shortcut?: string;
	readonly disabled?: boolean;
}

export function TuiButton({
	label,
	isFocused = false,
	shortcut,
	disabled = false,
}: TuiButtonProps) {
	if (disabled) {
		return (
			<text fg={TuiNamedColors.muted} attributes={TextAttributes.DIM}>
				[ {label} ]
			</text>
		);
	}

	if (isFocused) {
		return (
			<text attributes={TextAttributes.INVERSE | TextAttributes.BOLD} fg={TuiNamedColors.accent}>
				&gt; {label}{shortcut ? ` (${shortcut})` : ""} &lt;
			</text>
		);
	}

	return (
		<text fg={TuiNamedColors.primary}>
			[ {label}{shortcut ? ` (${shortcut})` : ""} ]
		</text>
	);
}
