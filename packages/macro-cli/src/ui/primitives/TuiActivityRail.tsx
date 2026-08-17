import { TextAttributes } from "@opentui/core";
import { GlobalThemeRegistry, type TuiThemeDefinition } from "../theme";

export interface TuiActivityItem {
	readonly id: string;
	readonly label: string;
	readonly icon: string;
	readonly altKey?: string | number;
	readonly isActive?: boolean;
	readonly badge?: string | number;
}

export interface TuiActivityRailProps {
	readonly items: readonly TuiActivityItem[];
	readonly activeId?: string;
	readonly onSelect?: (id: string) => void;
	/** Whether this rail's region currently has keyboard input focus */
	readonly isFocused?: boolean;
	readonly theme?: TuiThemeDefinition;
}

/**
 * Calculates visual monospace cell width for terminal strings.
 * Handles 1-cell glyphs (⌂, ▧, ⚙, ◷) and 2-cell wide emojis (🕒, 📁).
 */
export function getMonospaceWidth(str: string): number {
	let width = 0;
	for (const char of str) {
		const code = char.codePointAt(0) ?? 0;
		// Zero-width characters & variation selectors (e.g. \uFE0F)
		if (code === 0xfe0f || code === 0xfe0e || (code >= 0x200b && code <= 0x200f)) {
			continue;
		}
		// Wide characters (Emojis, CJK, etc.)
		if (
			(code >= 0x1f300 && code <= 0x1faff) ||
			(code >= 0x2600 && code <= 0x27bf) ||
			(code >= 0x4e00 && code <= 0x9fff)
		) {
			width += 2;
		} else {
			width += 1;
		}
	}
	return width;
}

/**
 * Centers an icon or text within a fixed cell target width (default 3 columns).
 */
export function centerInCell(content: string, targetWidth = 3): string {
	const currentWidth = getMonospaceWidth(content);
	if (currentWidth >= targetWidth) {
		return content;
	}
	const remaining = targetWidth - currentWidth;
	const padLeft = Math.floor(remaining / 2);
	const padRight = remaining - padLeft;
	return " ".repeat(padLeft) + content + " ".repeat(padRight);
}

/**
 * Optically centered Vertical Activity Rail with fixed 2-row button rhythm.
 * Column Geometry (4 characters wide + vertical border):
 * - Col 0: Left Accent Pillar (▎ when active, space when inactive)
 * - Col 1..3: Optically centered icon / key (exactly 3 monospace cells)
 */
export function TuiActivityRail({
	items,
	activeId,
	isFocused = false,
	theme,
}: TuiActivityRailProps) {
	const c = (theme ?? GlobalThemeRegistry.getActive()).colors;
	const activeItemId = activeId ?? items.find((i) => i.isActive)?.id ?? items[0]?.id;
	// Focused: bright accent pillar; Active-but-unfocused: dim accent pillar; Inactive: invisible
	const pillarColor = isFocused ? c.fgPrimary : c.accentPrimary;

	return (
		<box
			flexDirection="column"
			width={4}
			backgroundColor={c.bgCanvas}
			paddingTop={1}
			paddingBottom={1}
		>
			{items.map((item) => {
				const isActive = item.id === activeItemId;
				const itemBg = isActive ? c.bgElevated : "transparent";
				const iconColor = isActive ? c.accentPrimary : c.fgMuted;
				const keyColor = isActive ? c.accentPrimary : c.fgDim;

				const centeredIcon = centerInCell(item.icon, 3);
				const centeredKey = centerInCell(String(item.altKey ?? " "), 3);

				return (
					<box
						key={item.id}
						flexDirection="column"
						width={4}
						backgroundColor={itemBg}
						marginBottom={1}
					>
						{/* Row 1: Left Pillar (1 char) + Centered Icon (3 chars) */}
						<box height={1} flexDirection="row" width={4}>
							<text fg={isActive ? pillarColor : "transparent"} attributes={TextAttributes.BOLD}>
								{isActive ? "▎" : " "}
							</text>
							<text fg={iconColor} attributes={isActive ? TextAttributes.BOLD : 0}>
								{centeredIcon}
							</text>
						</box>

						{/* Row 2: Left Pillar (1 char) + Centered Alt-Key (3 chars) */}
						<box height={1} flexDirection="row" width={4}>
							<text fg={isActive ? c.accentPrimary : "transparent"} attributes={TextAttributes.BOLD}>
								{isActive ? "▎" : " "}
							</text>
							<text
								fg={keyColor}
								attributes={isActive ? TextAttributes.BOLD : TextAttributes.DIM}
							>
								{centeredKey}
							</text>
						</box>
					</box>
				);
			})}
		</box>
	);
}
