import { TextAttributes } from "@opentui/core";
import type { EditorKeymapProfile, MacroWorkspace } from "@stateful-mcp/macro";
import { translate } from "../locales";
import { formatKeyDisplay } from "../ui/primitives/TuiHelpBar";
import { TuiColors, TuiNamedColors } from "../ui/tokens";

export function ScratchpadView({
	workspace,
	keymap,
}: {
	workspace: MacroWorkspace;
	keymap?: EditorKeymapProfile;
}) {
	const cursor = workspace.editor.buffer.getCursor();
	const lines = workspace.editor.buffer.getLines();
	const projected = workspace.scratchpad.getProjectedLines();
	const pinned = workspace.scratchpad.getPinnedMacro();
	const mode = workspace.editor.getMode();
	const selection = workspace.editor.buffer.getSelection();
	const i18n = workspace.i18n;

	const isVisualMode = mode === "VISUAL";
	const minSelectedLine = selection ? Math.min(selection.start.line, selection.end.line) : -1;
	const maxSelectedLine = selection ? Math.max(selection.start.line, selection.end.line) : -1;

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
		? translate(i18n, "scratchpad.pinnedLabel", `PINNED: ${pinned}`, { macro: pinned })
		: "";

	const pinnedHint = translate(
		i18n,
		"scratchpad.pinnedHint",
		`(${pinChord} to toggle)`,
		{ key: pinChord },
	);

	return (
		<box flexDirection="column" paddingLeft={1} paddingRight={1} paddingTop={1}>
			{/* Top Pinned Macro Banner if active */}
			{pinned && (
				<box height={1} marginBottom={1} flexDirection="row">
					<text fg={TuiNamedColors.accent} attributes={TextAttributes.BOLD}>
						📌 {pinnedLabel}
					</text>
					<text fg={TuiNamedColors.muted} attributes={TextAttributes.DIM}>
						{"  "}{pinnedHint}
					</text>
				</box>
			)}

			{lines.map((line, index) => {
				const projection = projected[index];
				const isActive = cursor.line === index;
				const isSelectedInVisual = isVisualMode && index >= minSelectedLine && index <= maxSelectedLine;
				const isHighlighted = isActive || isSelectedInVisual;

				const isPinned = pinned && projection?.macroName === pinned;
				const hasError = projection && !projection.isValid && projection.diagnostics.length > 0;
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
					? "cyan"
					: hasError
						? "red"
						: isValid
							? "green"
							: TuiNamedColors.muted;

				const rowBg = isSelectedInVisual
					? TuiColors.bgActive
					: isActive
						? TuiColors.bgHighlight
						: undefined;

				const leftBarColor = isHighlighted ? "cyan" : hasError ? "red" : "transparent";

				const pinnedBadge = isPinned
					? translate(i18n, "scratchpad.pinnedBadge", `[pinned to ${pinned}]`, { macro: pinned })
					: "";

				return (
					<box key={`${index}-${line}`} flexDirection="column">
						{/* Row 1: Main Command Input */}
						<box flexDirection="row" backgroundColor={rowBg} height={1}>
							{/* Left accent pillar (1 char) */}
							<text
								fg={leftBarColor}
								attributes={TextAttributes.BOLD}
							>
								{isHighlighted || hasError ? "▎" : " "}
							</text>

							{/* Sign column (3 chars) */}
							<text fg={signColor} attributes={TextAttributes.BOLD}>
								{" "}{signChar}{" "}
							</text>

							{/* Line Number (3 chars) */}
							<text
								fg={isHighlighted ? "yellow" : TuiNamedColors.muted}
								attributes={isHighlighted ? TextAttributes.BOLD : 0}
							>
								{lineNumStr}{" "}
							</text>

							{/* Continuous vertical pipe divider */}
							<text fg={TuiNamedColors.border}>│ </text>

							{/* Command Input Text */}
							{isEmptyBuffer && isActive ? (
								<box flexDirection="row">
									<text fg="white" attributes={TextAttributes.INVERSE}>
										{" "}
									</text>
									<text fg={TuiNamedColors.muted} attributes={TextAttributes.DIM}>
										{" "}{placeholderText}
									</text>
								</box>
							) : (
								<text
									fg={isHighlighted ? "white" : TuiNamedColors.primary}
									attributes={isHighlighted ? TextAttributes.BOLD : 0}
								>
									{line || " "}
								</text>
							)}

							{/* Pinned Tag */}
							{isPinned && (
								<text fg={TuiNamedColors.accent} attributes={TextAttributes.DIM}>
									{"  "}[pinned]
								</text>
							)}
						</box>

						{/* Row 2: Fixed-Height Projection Tray */}
						<box flexDirection="row" backgroundColor={rowBg} height={1}>
							<text
								fg={leftBarColor}
								attributes={TextAttributes.BOLD}
							>
								{isHighlighted || hasError ? "▎" : " "}
							</text>
							<text fg="transparent">      </text>
							<text fg={TuiNamedColors.border}>│ </text>
							{hasError ? (
								<text fg={TuiNamedColors.error}>
									! {projection.diagnostics[0]?.message}
								</text>
							) : projection?.preview ? (
								<text fg={projection.isValid ? TuiNamedColors.success : TuiNamedColors.amber}>
									↳ {projection.preview.text}
								</text>
							) : (
								<text fg={TuiNamedColors.muted} attributes={TextAttributes.DIM}>
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
