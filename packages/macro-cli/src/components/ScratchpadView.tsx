import { TextAttributes } from "@opentui/core";
import type { EditorKeymapProfile, MacroWorkspace } from "@stateful-mcp/macro";
import { translate } from "../locales";
import { TuiCursor } from "../ui/primitives/TuiCursor";
import { formatKeyDisplay } from "../ui/primitives/TuiHelpBar";
import { GlobalThemeRegistry, type TuiThemeDefinition } from "../ui/theme";

export function ScratchpadView({
	workspace,
	keymap,
	theme,
}: {
	workspace: MacroWorkspace;
	keymap?: EditorKeymapProfile;
	theme?: TuiThemeDefinition;
}) {
	const c = (theme ?? GlobalThemeRegistry.getActive()).colors;
	const cursor = workspace.editor.buffer.getCursor();
	const lines = workspace.editor.buffer.getLines();
	const projected = workspace.scratchpad.getProjectedLines();
	const pinned = workspace.scratchpad.getPinnedMacro();
	const mode = workspace.editor.getMode();
	const selection = workspace.editor.buffer.getSelection();
	const i18n = workspace.i18n;

	const isVisualMode = mode === "VISUAL";
	const minSelectedLine = selection
		? Math.min(selection.start.line, selection.end.line)
		: -1;
	const maxSelectedLine = selection
		? Math.max(selection.start.line, selection.end.line)
		: -1;

	const isEmptyBuffer = lines.length === 1 && lines[0] === "";
	const pinChord = formatKeyDisplay(keymap?.window.pinMacro || "Alt+P");
	const trigger = workspace.runtime?.context?.syntax?.macroStartToken || "^";

	const placeholderText = translate(
		i18n,
		"scratchpad.emptyPlaceholder",
		`Type ${trigger} for macro autocomplete or start typing...`,
		{ trigger },
	);

	const pinnedLabel = pinned
		? translate(i18n, "scratchpad.pinnedLabel", `PINNED: ${pinned}`, {
				macro: pinned,
			})
		: "";

	const pinnedHint = translate(
		i18n,
		"scratchpad.pinnedHint",
		`(${pinChord} to toggle)`,
		{ key: pinChord },
	);

	return (
		<box flexDirection="column">
			{/* Top Pinned Macro Banner if active */}
			{pinned && (
				<box height={1} marginBottom={1} flexDirection="row">
					<text fg={c.accentAmber} attributes={TextAttributes.BOLD}>
						📌 {pinnedLabel}
					</text>
					<text fg={c.fgMuted} attributes={TextAttributes.DIM}>
						{"  "}
						{pinnedHint}
					</text>
				</box>
			)}

			{lines.map((line, index) => {
				const projection = projected[index];
				const isActive = cursor.line === index;
				const isSelectedInVisual =
					isVisualMode && index >= minSelectedLine && index <= maxSelectedLine;
				const isHighlighted = isActive || isSelectedInVisual;

				const isPinned = pinned && projection?.macroName === pinned;
				const hasError =
					projection &&
					!projection.isValid &&
					projection.diagnostics.length > 0;
				const isValid = projection?.isValid ?? false;

				const lineNumStr = String(index + 1).padStart(2, "0");
				const signChar = isSelectedInVisual
					? "●"
					: isActive
						? "●"
						: hasError
							? "!"
							: isValid
								? "✓"
								: " ";

				const signColor = isHighlighted
					? c.accentPrimary
					: hasError
						? c.statusError
						: isValid
							? c.statusSuccess
							: c.fgMuted;

				const rowBg = isSelectedInVisual
					? c.bgActive
					: isActive
						? c.bgElevated
						: undefined;

				const leftBarColor = isHighlighted
					? c.accentPrimary
					: hasError
						? c.statusError
						: "transparent";

				const pinnedBadge = isPinned
					? translate(i18n, "scratchpad.pinnedBadge", `[pinned to ${pinned}]`, {
							macro: pinned,
						})
					: "";

				// Parse cursor position on active line
				const beforeCursor = line.slice(0, cursor.col);
				const cursorChar = line.slice(cursor.col, cursor.col + 1) || " ";
				const afterCursor = line.slice(cursor.col + 1);

				return (
					<box key={`${index}-${line}`} flexDirection="column">
						{/* Row 1: Main Command Input */}
						<box flexDirection="row" backgroundColor={rowBg} height={1}>
							{/* Left accent pillar (1 char) */}
							<text fg={leftBarColor} attributes={TextAttributes.BOLD}>
								{isHighlighted || hasError ? "▎" : " "}
							</text>

							{/* Sign column (3 chars) */}
							<text fg={signColor} attributes={TextAttributes.BOLD}>
								{" "}
								{signChar}{" "}
							</text>

							{/* Line Number (3 chars) */}
							<text
								fg={isHighlighted ? c.accentAmber : c.fgMuted}
								attributes={isHighlighted ? TextAttributes.BOLD : 0}
							>
								{lineNumStr}{" "}
							</text>

							{/* Continuous vertical pipe divider */}
							<text fg={c.borderDefault}>│ </text>

							{/* Command Input Text with Precise Inline Blinking Cursor */}
							{isEmptyBuffer && isActive ? (
								<box flexDirection="row">
									<TuiCursor
										char={placeholderText.slice(0, 1)}
										isPlaceholder={true}
										theme={theme}
									/>
									<text fg={c.fgMuted} attributes={TextAttributes.DIM}>
										{placeholderText.slice(1)}
									</text>
								</box>
							) : isActive ? (
								<box flexDirection="row">
									{beforeCursor.length > 0 && (
										<text fg={c.fgPrimary} attributes={TextAttributes.BOLD}>
											{beforeCursor}
										</text>
									)}
									<TuiCursor char={cursorChar} theme={theme} />
									{afterCursor.length > 0 && (
										<text fg={c.fgPrimary} attributes={TextAttributes.BOLD}>
											{afterCursor}
										</text>
									)}
								</box>
							) : (
								<text
									fg={isHighlighted ? c.fgPrimary : c.fgSecondary}
									attributes={isHighlighted ? TextAttributes.BOLD : 0}
								>
									{line || " "}
								</text>
							)}

							{/* Pinned Tag */}
							{isPinned && (
								<text fg={c.accentAmber} attributes={TextAttributes.DIM}>
									{"  "}[pinned]
								</text>
							)}
						</box>

						{/* Row 2: Fixed-Height Projection Tray */}
						<box flexDirection="row" backgroundColor={rowBg} height={1}>
							<text fg={leftBarColor} attributes={TextAttributes.BOLD}>
								{isHighlighted || hasError ? "▎" : " "}
							</text>
							<text fg="transparent"> </text>
							<text fg={c.borderDefault}>│ </text>
							{hasError ? (
								<text fg={c.statusError}>
									! {projection.diagnostics[0]?.message}
								</text>
							) : projection?.preview ? (
								<text
									fg={projection.isValid ? c.statusSuccess : c.statusWarning}
								>
									↳ {projection.preview.text}
								</text>
							) : (
								<text fg={c.fgMuted} attributes={TextAttributes.DIM}>
									{" "}
								</text>
							)}
						</box>
					</box>
				);
			})}
		</box>
	);
}
