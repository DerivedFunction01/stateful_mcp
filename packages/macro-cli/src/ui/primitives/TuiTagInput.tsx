import { TextAttributes } from "@opentui/core";
import { GlobalThemeRegistry, type TuiThemeDefinition } from "../theme";

// ─── TUI TAG INPUT & CHIP CLOUD ───────────────────────────────────────────────

export interface TuiTagItem {
	readonly id: string;
	readonly label: string;
	readonly color?: string;
	readonly disabled?: boolean;
}

export interface TuiTagInputProps {
	readonly tags: readonly TuiTagItem[];
	readonly label?: string;
	readonly activeIndex?: number;
	readonly isFocused?: boolean;
	readonly maxTags?: number;
	readonly placeholder?: string;
	readonly width?: number;
	readonly theme?: TuiThemeDefinition;
}

export function TuiTagInput({
	tags,
	label,
	activeIndex = -1,
	isFocused = false,
	placeholder = "+ Add tag…",
	width = 38,
	theme,
}: TuiTagInputProps) {
	const c = (theme ?? GlobalThemeRegistry.getActive()).colors;

	const borderColor = isFocused ? c.borderActive : c.borderDefault;
	const containerBg = isFocused ? c.bgElevated : c.bgSurface;

	return (
		<box flexDirection="column" width={width}>
			{label && (
				<box height={1} marginBottom={0}>
					<text fg={isFocused ? c.accentPrimary : c.fgSecondary} attributes={TextAttributes.BOLD}>
						{label}
					</text>
				</box>
			)}
			<box
				borderStyle="single"
				borderColor={borderColor}
				backgroundColor={containerBg}
				flexDirection="row"
				flexWrap="wrap"
				paddingLeft={1}
				paddingRight={1}
			>
				{tags.map((tag, idx) => {
					const isTagActive = idx === activeIndex && isFocused;
					const tagBg = isTagActive ? c.accentPrimary : c.bgActive;
					const tagFg = isTagActive ? c.fgInverse : tag.color ?? c.fgPrimary;

					return (
						<box
							key={tag.id}
							backgroundColor={tagBg}
							flexDirection="row"
							marginRight={1}
							paddingLeft={1}
							paddingRight={1}
						>
							<text fg={tagFg} attributes={isTagActive ? TextAttributes.BOLD : 0}>
								{tag.label}
							</text>
							<text fg={isTagActive ? c.fgInverse : c.fgDim} attributes={TextAttributes.DIM}>
								{" ✕"}
							</text>
						</box>
					);
				})}
				<box flexDirection="row">
					<text fg={c.fgDim} attributes={TextAttributes.DIM}>
						{placeholder}
					</text>
				</box>
			</box>
		</box>
	);
}
