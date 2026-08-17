import { TextAttributes } from "@opentui/core";
import { TuiColors, TuiNamedColors } from "../tokens";

export type TuiStatusBarVariant = "lualine" | "vscode" | "opencode" | "segmented";

export interface TuiStatusBarProps {
	readonly variant?: TuiStatusBarVariant;
	readonly mode?: "NORMAL" | "INSERT" | "VISUAL" | "COMMAND";
	readonly cursorLine?: number;
	readonly cursorCol?: number;
	readonly validCount?: number;
	readonly totalCount?: number;
	readonly pinnedMacro?: string | null;
	readonly locale?: string;
	readonly sessionTitle?: string;
	readonly diagnosticErrorCount?: number;
	readonly diagnosticWarningCount?: number;
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
}: TuiStatusBarProps) {
	// Mode colors
	const modeBg =
		mode === "NORMAL"
			? "#2ea043" // GitHub Emerald Green
			: mode === "INSERT"
				? "#38bdf8" // Sky Blue
				: mode === "VISUAL"
					? "#a371f7" // Purple
					: "#f59e0b"; // Amber (COMMAND)

	const modeFg = "#0d1117"; // High-contrast black text on mode badge

	// 1. Lualine / Neovim Powerline Style (Default)
	if (variant === "lualine") {
		return (
			<box height={1} backgroundColor={TuiColors.bgSurface} flexDirection="row">
				{/* Section A: High-Contrast Solid Mode Pill */}
				<box backgroundColor={modeBg} paddingLeft={1} paddingRight={1}>
					<text fg={modeFg} attributes={TextAttributes.BOLD}>
						{mode}
					</text>
				</box>

				{/* Section B: Session or Context */}
				{sessionTitle && (
					<box paddingLeft={1} paddingRight={1} backgroundColor={TuiColors.bgHighlight}>
						<text fg={TuiNamedColors.primary} attributes={TextAttributes.BOLD}>
							{sessionTitle}
						</text>
					</box>
				)}

				{/* Section C: Metrics & Projections */}
				{totalCount !== undefined && totalCount > 0 && (
					<box paddingLeft={1} paddingRight={1} flexDirection="row">
						<text fg={validCount === totalCount ? TuiNamedColors.success : TuiNamedColors.amber}>
							● {validCount ?? 0}/{totalCount} valid
						</text>
					</box>
				)}

				{/* Diagnostics */}
				{diagnosticErrorCount > 0 && (
					<box paddingLeft={1} paddingRight={1} flexDirection="row">
						<text fg={TuiNamedColors.error} attributes={TextAttributes.BOLD}>
							! {diagnosticErrorCount} err
						</text>
					</box>
				)}

				{pinnedMacro && (
					<box paddingLeft={1} paddingRight={1} flexDirection="row">
						<text fg={TuiNamedColors.accent}>
							📌 {pinnedMacro}
						</text>
					</box>
				)}

				<box flexGrow={1} />

				{/* Section Y: Cursor Position */}
				<box paddingLeft={1} paddingRight={1}>
					<text fg={TuiNamedColors.muted}>
						Ln {cursorLine}, Col {cursorCol}
					</text>
				</box>

				<text fg={TuiNamedColors.border}>│</text>

				{/* Section Z: Locale Badge */}
				<box paddingLeft={1} paddingRight={1} backgroundColor={TuiColors.bgHighlight}>
					<text fg={TuiNamedColors.primary} attributes={TextAttributes.BOLD}>
						{locale.toUpperCase()}
					</text>
				</box>
			</box>
		);
	}

	// 2. VS Code Status Ribbon Style
	if (variant === "vscode") {
		return (
			<box height={1} backgroundColor={TuiColors.bgSurface} paddingLeft={1} paddingRight={1} flexDirection="row">
				{/* Left items */}
				<box flexDirection="row">
					<text fg={modeBg} attributes={TextAttributes.BOLD}>
						{mode}
					</text>
					<text fg={TuiNamedColors.border}> │ </text>

					{totalCount !== undefined && totalCount > 0 && (
						<box flexDirection="row">
							<text fg={validCount === totalCount ? TuiNamedColors.success : TuiNamedColors.amber}>
								{validCount ?? 0}/{totalCount} valid
							</text>
							<text fg={TuiNamedColors.border}> │ </text>
						</box>
					)}

					{diagnosticErrorCount > 0 && (
						<box flexDirection="row">
							<text fg={TuiNamedColors.error} attributes={TextAttributes.BOLD}>
								⊗ {diagnosticErrorCount}
							</text>
							<text fg={TuiNamedColors.border}> │ </text>
						</box>
					)}

					{pinnedMacro && (
						<box flexDirection="row">
							<text fg={TuiNamedColors.accent}>
								📌 {pinnedMacro}
							</text>
							<text fg={TuiNamedColors.border}> │ </text>
						</box>
					)}
				</box>

				<box flexGrow={1} />

				{/* Right items */}
				<box flexDirection="row">
					<text fg={TuiNamedColors.muted}>
						Ln {cursorLine}, Col {cursorCol}
					</text>
					<text fg={TuiNamedColors.border}> │ </text>
					<text fg={TuiNamedColors.muted}>
						UTF-8
					</text>
					<text fg={TuiNamedColors.border}> │ </text>
					<text fg={TuiNamedColors.primary} attributes={TextAttributes.BOLD}>
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
				<text fg={TuiNamedColors.border}>  │  </text>

				{totalCount !== undefined && totalCount > 0 && (
					<box flexDirection="row">
						<text fg={validCount === totalCount ? TuiNamedColors.success : TuiNamedColors.amber}>
							{validCount ?? 0}/{totalCount} valid
						</text>
						<text fg={TuiNamedColors.border}>  │  </text>
					</box>
				)}

				{pinnedMacro && (
					<box flexDirection="row">
						<text fg={TuiNamedColors.accent}>
							pinned: {pinnedMacro}
						</text>
						<text fg={TuiNamedColors.border}>  │  </text>
					</box>
				)}

				<box flexGrow={1} />

				<text fg={TuiNamedColors.muted} attributes={TextAttributes.DIM}>
					{cursorLine}:{cursorCol}
				</text>
				<text fg={TuiNamedColors.border}>  │  </text>
				<text fg={TuiNamedColors.muted} attributes={TextAttributes.DIM}>
					{locale}
				</text>
			</box>
		);
	}

	// 4. Segmented Cards Style
	return (
		<box height={1} paddingLeft={1} paddingRight={1} flexDirection="row">
			<box backgroundColor={TuiColors.bgHighlight} paddingLeft={1} paddingRight={1} marginRight={1}>
				<text fg={modeBg} attributes={TextAttributes.BOLD}>
					{mode}
				</text>
			</box>

			{totalCount !== undefined && totalCount > 0 && (
				<box backgroundColor={TuiColors.bgHighlight} paddingLeft={1} paddingRight={1} marginRight={1}>
					<text fg={validCount === totalCount ? TuiNamedColors.success : TuiNamedColors.amber}>
						{validCount ?? 0}/{totalCount} valid
					</text>
				</box>
			)}

			{pinnedMacro && (
				<box backgroundColor={TuiColors.bgHighlight} paddingLeft={1} paddingRight={1} marginRight={1}>
					<text fg={TuiNamedColors.accent}>
						📌 {pinnedMacro}
					</text>
				</box>
			)}

			<box flexGrow={1} />

			<box backgroundColor={TuiColors.bgHighlight} paddingLeft={1} paddingRight={1} marginRight={1}>
				<text fg={TuiNamedColors.primary}>
					Ln {cursorLine}, Col {cursorCol}
				</text>
			</box>

			<box backgroundColor={TuiColors.bgHighlight} paddingLeft={1} paddingRight={1}>
				<text fg={TuiNamedColors.accent} attributes={TextAttributes.BOLD}>
					{locale.toUpperCase()}
				</text>
			</box>
		</box>
	);
}
