import { TextAttributes } from "@opentui/core";
import type { ReactNode } from "react";
import { TuiNamedColors } from "../tokens";

export type TuiBadgeVariant = "primary" | "success" | "warning" | "error" | "info" | "muted" | "inverse";

export interface TuiBadgeProps {
	readonly label: ReactNode;
	readonly variant?: TuiBadgeVariant;
	readonly bold?: boolean;
	readonly bracketed?: boolean;
}

export function TuiBadge({
	label,
	variant = "primary",
	bold = false,
	bracketed = false,
}: TuiBadgeProps) {
	let fg: string = TuiNamedColors.primary;
	let attributes = bold ? TextAttributes.BOLD : 0;

	switch (variant) {
		case "success":
			fg = TuiNamedColors.success;
			break;
		case "warning":
			fg = TuiNamedColors.warning;
			break;
		case "error":
			fg = TuiNamedColors.error;
			break;
		case "info":
			fg = TuiNamedColors.info;
			break;
		case "muted":
			fg = TuiNamedColors.muted;
			attributes = attributes | TextAttributes.DIM;
			break;
		case "inverse":
			attributes = attributes | TextAttributes.INVERSE;
			break;
		default:
			fg = TuiNamedColors.primary;
			break;
	}

	const content = bracketed ? `[ ${label} ]` : String(label);

	return (
		<text fg={fg} attributes={attributes}>
			{content}
		</text>
	);
}
