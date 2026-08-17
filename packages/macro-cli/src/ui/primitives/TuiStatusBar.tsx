import { TextAttributes } from "@opentui/core";
import type { EditorMode } from "@stateful-mcp/macro";
import { GlobalThemeRegistry, type TuiThemeDefinition } from "../theme";

export type TuiStatusBarVariant =
	| "lualine"
	| "vscode"
	| "opencode"
	| "segmented";

export interface TuiStatusBarProps {
	readonly variant?: TuiStatusBarVariant;
	readonly mode?: EditorMode;
	readonly cursorLine?: number;
	readonly cursorCol?: number;
	readonly validCount?: number;
	readonly totalCount?: number;
	readonly pinnedMacro?: string | null;
	readonly locale?: string;
	readonly sessionTitle?: string;
	readonly diagnosticErrorCount?: number;
	readonly diagnosticWarningCount?: number;
	readonly theme?: TuiThemeDefinition;
}

export function TuiStatusBar({
	variant = "lualine",
	mode = "NORMAL",
	cursorLine = 1,
	cursorCol = 1,
	validCount,
	totalCount,
	pinnedMacro,
	locale = "en",
	sessionTitle,
	diagnosticErrorCount = 0,
	diagnosticWarningCount = 0,
	theme,
}: TuiStatusBarProps) {
	const c = (theme ?? GlobalThemeRegistry.getActive()).colors;

	// Mode colors from theme
	const modeBg =
		mode === "NORMAL"
			? c.modeNormalBg
			: mode === "INSERT"
				? c.modeInsertBg
				: mode === "VISUAL"
					? c.modeVisualBg
					: c.modeCommandBg;

	const modeFg = c.modeBadgeFg;

	// 1. Lualine / Neovim Powerline Style (Default)
	if (variant === "lualine") {
		return (
			<box height={1} backgroundColor={c.bgSurface} flexDirection="row">
				{/* Section A: High-Contrast Solid Mode Pill */}
				<box backgroundColor={modeBg} paddingLeft={1} paddingRight={1}>
					<text fg={modeFg} attributes={TextAttributes.BOLD}>
						{mode}
					</text>
				</box>

				{/* Section B: Session or Context */}
				{sessionTitle && (
					<box paddingLeft={1} paddingRight={1} backgroundColor={c.bgElevated}>
						<text fg={c.fgPrimary} attributes={TextAttributes.BOLD}>
							{sessionTitle}
						</text>
					</box>
				)}

				{/* Section C: Metrics & Projections */}
				{totalCount !== undefined && totalCount > 0 && (
					<box paddingLeft={1} paddingRight={1} flexDirection="row">
						<text
							fg={validCount === totalCount ? c.statusSuccess : c.statusWarning}
						>
							● {validCount ?? 0}/{totalCount} valid
						</text>
					</box>
				)}

				{/* Diagnostics */}
				{diagnosticErrorCount > 0 && (
					<box paddingLeft={1} paddingRight={1} flexDirection="row">
						<text fg={c.statusError} attributes={TextAttributes.BOLD}>
							! {diagnosticErrorCount} err
						</text>
					</box>
				)}

				{pinnedMacro && (
					<box paddingLeft={1} paddingRight={1} flexDirection="row">
						<text fg={c.accentAmber}>📌 {pinnedMacro}</text>
					</box>
				)}

				<box flexGrow={1} />

				{/* Section Y: Cursor Position */}
				<box paddingLeft={1} paddingRight={1}>
					<text fg={c.fgMuted}>
						Ln {cursorLine}, Col {cursorCol}
					</text>
				</box>

				<text fg={c.borderDefault}>│</text>

				{/* Section Z: Locale Badge */}
				<box paddingLeft={1} paddingRight={1} backgroundColor={c.bgElevated}>
					<text fg={c.fgPrimary} attributes={TextAttributes.BOLD}>
						{locale.toUpperCase()}
					</text>
				</box>
			</box>
		);
	}

	// 2. VS Code Status Ribbon Style
	if (variant === "vscode") {
		return (
			<box
				height={1}
				backgroundColor={c.bgSurface}
				paddingLeft={1}
				paddingRight={1}
				flexDirection="row"
			>
				<box flexDirection="row">
					<text fg={modeBg} attributes={TextAttributes.BOLD}>
						{mode}
					</text>
					<text fg={c.borderDefault}> │ </text>

					{totalCount !== undefined && totalCount > 0 && (
						<box flexDirection="row">
							<text
								fg={
									validCount === totalCount ? c.statusSuccess : c.statusWarning
								}
							>
								{validCount ?? 0}/{totalCount} valid
							</text>
							<text fg={c.borderDefault}> │ </text>
						</box>
					)}

					{diagnosticErrorCount > 0 && (
						<box flexDirection="row">
							<text fg={c.statusError} attributes={TextAttributes.BOLD}>
								⊗ {diagnosticErrorCount}
							</text>
							<text fg={c.borderDefault}> │ </text>
						</box>
					)}

					{pinnedMacro && (
						<box flexDirection="row">
							<text fg={c.accentAmber}>📌 {pinnedMacro}</text>
							<text fg={c.borderDefault}> │ </text>
						</box>
					)}
				</box>

				<box flexGrow={1} />

				<box flexDirection="row">
					<text fg={c.fgMuted}>
						Ln {cursorLine}, Col {cursorCol}
					</text>
					<text fg={c.borderDefault}> │ </text>
					<text fg={c.fgMuted}>UTF-8</text>
					<text fg={c.borderDefault}> │ </text>
					<text fg={c.fgPrimary} attributes={TextAttributes.BOLD}>
						{locale.toUpperCase()}
					</text>
				</box>
			</box>
		);
	}

	// 3. OpenCode Minimalist Style
	if (variant === "opencode") {
		return (
			<box height={1} paddingLeft={1} paddingRight={1} flexDirection="row">
				<text fg={modeBg} attributes={TextAttributes.BOLD}>
					● {mode}
				</text>
				<text fg={c.borderDefault}> │ </text>

				{totalCount !== undefined && totalCount > 0 && (
					<box flexDirection="row">
						<text
							fg={validCount === totalCount ? c.statusSuccess : c.statusWarning}
						>
							{validCount ?? 0}/{totalCount} valid
						</text>
						<text fg={c.borderDefault}> │ </text>
					</box>
				)}

				{pinnedMacro && (
					<box flexDirection="row">
						<text fg={c.accentAmber}>pinned: {pinnedMacro}</text>
						<text fg={c.borderDefault}> │ </text>
					</box>
				)}

				<box flexGrow={1} />

				<text fg={c.fgMuted} attributes={TextAttributes.DIM}>
					{cursorLine}:{cursorCol}
				</text>
				<text fg={c.borderDefault}> │ </text>
				<text fg={c.fgMuted} attributes={TextAttributes.DIM}>
					{locale}
				</text>
			</box>
		);
	}

	// 4. Segmented Cards Style
	return (
		<box height={1} paddingLeft={1} paddingRight={1} flexDirection="row">
			<box
				backgroundColor={c.bgElevated}
				paddingLeft={1}
				paddingRight={1}
				marginRight={1}
			>
				<text fg={modeBg} attributes={TextAttributes.BOLD}>
					{mode}
				</text>
			</box>

			{totalCount !== undefined && totalCount > 0 && (
				<box
					backgroundColor={c.bgElevated}
					paddingLeft={1}
					paddingRight={1}
					marginRight={1}
				>
					<text
						fg={validCount === totalCount ? c.statusSuccess : c.statusWarning}
					>
						{validCount ?? 0}/{totalCount} valid
					</text>
				</box>
			)}

			{pinnedMacro && (
				<box
					backgroundColor={c.bgElevated}
					paddingLeft={1}
					paddingRight={1}
					marginRight={1}
				>
					<text fg={c.accentAmber}>📌 {pinnedMacro}</text>
				</box>
			)}

			<box flexGrow={1} />

			<box
				backgroundColor={c.bgElevated}
				paddingLeft={1}
				paddingRight={1}
				marginRight={1}
			>
				<text fg={c.fgPrimary}>
					Ln {cursorLine}, Col {cursorCol}
				</text>
			</box>

			<box backgroundColor={c.bgElevated} paddingLeft={1} paddingRight={1}>
				<text fg={c.accentPrimary} attributes={TextAttributes.BOLD}>
					{locale.toUpperCase()}
				</text>
			</box>
		</box>
	);
}
