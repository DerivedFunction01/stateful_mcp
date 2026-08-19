import { type MouseEvent, TextAttributes } from "@opentui/core";
import type { I18nKernel } from "@stateful-mcp/macro";
import { translate } from "@stateful-mcp/macro";
import { GlobalThemeRegistry, type TuiThemeDefinition } from "../theme";
import { TuiCursor } from "./TuiCursor";

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
	readonly isOpen?: boolean;
	readonly maxTags?: number;
	readonly placeholder?: string;
	readonly width?: number;
	readonly modalWidth?: number;
	readonly theme?: TuiThemeDefinition;
	readonly i18n?: I18nKernel;
	readonly onOpenChange?: (open: boolean) => void;
	readonly onAddTag?: (label: string) => void;
	readonly onRemoveTag?: (id: string) => void;
}

export function TuiTagInput({
	tags,
	label,
	activeIndex = -1,
	isFocused = false,
	isOpen = false,
	placeholder = "+ Add tag…",
	width = 38,
	modalWidth = 56,
	theme,
	i18n,
	onOpenChange,
	onRemoveTag,
}: TuiTagInputProps) {
	const c = (theme ?? GlobalThemeRegistry.getActive()).colors;

	const borderColor = isFocused ? c.borderActive : c.borderDefault;
	const containerBg = isFocused ? c.bgElevated : c.bgSurface;

	const trigger = (
		<box
			flexDirection="column"
			width={width}
			onMouseDown={(event: MouseEvent) => {
				if (event.button === 0) onOpenChange?.(!isOpen);
			}}
		>
			{label && (
				<box height={1} marginBottom={0}>
					<text
						fg={isFocused ? c.accentPrimary : c.fgSecondary}
						attributes={TextAttributes.BOLD}
					>
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
					const tagFg = isTagActive ? c.fgInverse : (tag.color ?? c.fgPrimary);

					return (
						<box
							key={tag.id}
							backgroundColor={tagBg}
							flexDirection="row"
							marginRight={1}
							paddingLeft={1}
							paddingRight={1}
							onMouseDown={(event: MouseEvent) => {
								if (event.button === 0) onRemoveTag?.(tag.id);
							}}
						>
							<text
								fg={tagFg}
								attributes={isTagActive ? TextAttributes.BOLD : 0}
							>
								{tag.label}
							</text>
							<text
								fg={isTagActive ? c.fgInverse : c.fgDim}
								attributes={TextAttributes.DIM}
							>
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

	if (!isOpen) {
		return trigger;
	}

	return (
		<box flexDirection="column" width={modalWidth}>
			{trigger}

			<box
				flexDirection="column"
				borderStyle="single"
				borderColor={c.borderDefault}
				backgroundColor={c.bgSurface}
				paddingLeft={2}
				paddingRight={2}
				paddingTop={1}
				paddingBottom={1}
				marginTop={1}
			>
				{/* Modal Header */}
				<box height={1} flexDirection="row" marginBottom={1}>
					<text fg={c.fgPrimary} attributes={TextAttributes.BOLD}>
						{translate(i18n, "tagInput.title")}
					</text>
					<box flexGrow={1} />
					<text fg={c.fgMuted} attributes={TextAttributes.DIM}>
						{translate(i18n, "palette.dismissHint")}
					</text>
				</box>

				{/* Input Bar with Blinking Cursor */}
				<box height={1} marginBottom={1} flexDirection="row">
					<TuiCursor char=" " theme={theme} />
					<text fg={c.fgDim} attributes={TextAttributes.DIM}>
						{" "}
						{translate(i18n, "tagInput.placeholder")}
					</text>
				</box>

				{/* Active Tags Matrix */}
				<box flexDirection="row" flexWrap="wrap" marginBottom={1}>
					{tags.map((tag) => (
						<box
							key={tag.id}
							backgroundColor={c.bgActive}
							flexDirection="row"
							marginRight={1}
							marginBottom={1}
							paddingLeft={1}
							paddingRight={1}
							onMouseDown={(event: MouseEvent) => {
								if (event.button === 0) onRemoveTag?.(tag.id);
							}}
						>
							<text fg={tag.color ?? c.fgPrimary}>{tag.label}</text>
							<text fg={c.statusError}>{" ✕"}</text>
						</box>
					))}
				</box>

				{/* Suggested Tags */}
				<box height={1} marginBottom={1} flexDirection="row">
					<text fg={c.fgSecondary} attributes={TextAttributes.DIM}>
						{translate(i18n, "tagInput.suggested")}{" "}
					</text>
					{["v2.0", "stable", "hotfix", "security"].map((sug) => (
						<box
							key={sug}
							backgroundColor={c.bgSurface}
							paddingLeft={1}
							paddingRight={1}
							marginRight={1}
						>
							<text fg={c.accentPrimary} attributes={TextAttributes.DIM}>
								+{sug}
							</text>
						</box>
					))}
				</box>

				{/* Action Footer */}
				<box flexDirection="row">
					<box
						backgroundColor={c.bgActive}
						paddingLeft={1}
						paddingRight={1}
						marginRight={2}
						onMouseDown={(event: MouseEvent) => {
							if (event.button === 0) onOpenChange?.(false);
						}}
					>
						<text fg={c.fgPrimary} attributes={TextAttributes.BOLD}>
							{translate(i18n, "modal.confirm")}
						</text>
					</box>

					<box
						backgroundColor={c.bgActive}
						paddingLeft={1}
						paddingRight={1}
						onMouseDown={(event: MouseEvent) => {
							if (event.button === 0) onOpenChange?.(false);
						}}
					>
						<text fg={c.fgMuted} attributes={TextAttributes.DIM}>
							{translate(i18n, "modal.cancel")}
						</text>
					</box>
				</box>
			</box>
		</box>
	);
}
