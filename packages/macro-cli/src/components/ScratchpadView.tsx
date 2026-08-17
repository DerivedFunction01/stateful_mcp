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
	const i18n = workspace.i18n;

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
				const isPinned = pinned && projection?.macroName === pinned;
				const hasError = projection && !projection.isValid && projection.diagnostics.length > 0;
				const isValid = projection?.isValid ?? false;

				const lineNumStr = String(index + 1).padStart(2, "0");
				const signChar = isActive ? "●" : hasError ? "!" : isValid ? "✓" : " ";
				const signColor = isActive
					? "cyan"
					: hasError
						? "red"
						: isValid
							? "green"
							: TuiNamedColors.muted;

				const rowBg = isActive ? TuiColors.bgHighlight : undefined;
				const leftBarColor = isActive ? "cyan" : hasError ? "red" : "transparent";

				const pinnedBadge = isPinned
					? translate(i18n, "scratchpad.pinnedBadge", `[pinned to ${pinned}]`, { macro: pinned })
					: "";

				return (
					<box key={`${index}-${line}`} flexDirection="column">
						{/* Row 1: Main Command Input (1 char left bar + 3 chars sign + 3 chars lineNum = 7 chars before pipe) */}
						<box flexDirection="row" backgroundColor={rowBg} height={1}>
							{/* Left accent pillar (1 char) */}
							<text
								fg={leftBarColor}
								attributes={TextAttributes.BOLD}
							>
								{isActive || hasError ? "▎" : " "}
							</text>

							{/* Sign column (3 chars) */}
							<text fg={signColor} attributes={TextAttributes.BOLD}>
								{" "}{signChar}{" "}
							</text>

							{/* Line Number (3 chars) */}
							<text
								fg={isActive ? "yellow" : TuiNamedColors.muted}
								attributes={isActive ? TextAttributes.BOLD : 0}
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
									fg={isActive ? "white" : TuiNamedColors.primary}
									attributes={isActive ? TextAttributes.BOLD : 0}
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

						{/* Row 2: Fixed-Height Projection Tray (1 char left bar + 6 chars gutter space = 7 chars before pipe) */}
						<box flexDirection="row" backgroundColor={rowBg} height={1}>
							<text
								fg={leftBarColor}
								attributes={TextAttributes.BOLD}
							>
								{isActive || hasError ? "▎" : " "}
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
