import { type MouseEvent, TextAttributes } from "@opentui/core";
import type { EditorKeymapProfile, MacroWorkspace } from "@stateful-mcp/macro";
import { useEffect, useState } from "react";
import { translate } from "../locales";
import {
	TuiScratchpadBody,
	type TuiScratchpadLineModel,
} from "../ui/compositions";
import {
	createScratchpadGeometry,
	scratchpadColumnAtX,
	scratchpadLineAtY,
} from "../ui/compositions/scratchpad-geometry";
import { TuiCursor } from "../ui/primitives/TuiCursor";
import { formatKeyDisplay } from "../ui/primitives/TuiHelpBar";
import { GlobalThemeRegistry, type TuiThemeDefinition } from "../ui/theme";

export function ScratchpadView({
	workspace,
	keymap,
	theme,
	height = 20,
}: {
	workspace: MacroWorkspace;
	keymap?: EditorKeymapProfile;
	theme?: TuiThemeDefinition;
	height?: number;
}) {
	const activeTheme = theme ?? GlobalThemeRegistry.getActive();
	const c = activeTheme.colors;
	const cursor = workspace.editor.buffer.getCursor();
	const authoredLines = workspace.editor.buffer.getLines();
	const projected = workspace.scratchpad.getProjectedLines();
	const pinned = workspace.scratchpad.getPinnedMacro();
	const mode = workspace.editor.getMode();
	const selection = workspace.editor.buffer.getSelection();
	const i18n = workspace.i18n;
	const isVisualMode = mode === "VISUAL";
	const viewportSize = Math.max(1, Math.floor((height - (pinned ? 2 : 0)) / 2));
	const [viewportOffset, setViewportOffset] = useState(0);
	const lineCount = authoredLines.length;
	const clampOffset = (offset: number) =>
		Math.max(
			0,
			Math.min(Math.max(0, lineCount - viewportSize), Math.floor(offset)),
		);
	const revealLine = (line: number) => {
		setViewportOffset((current) => {
			if (line < current) return clampOffset(line);
			if (line >= current + viewportSize)
				return clampOffset(line - viewportSize + 1);
			return clampOffset(current);
		});
	};
	useEffect(() => {
		revealLine(cursor.line);
	}, [cursor.line, viewportSize, lineCount]);
	const minSelectedLine = selection
		? Math.min(selection.start.line, selection.end.line)
		: -1;
	const maxSelectedLine = selection
		? Math.max(selection.start.line, selection.end.line)
		: -1;
	const isEmptyBuffer = authoredLines.length === 1 && authoredLines[0] === "";
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
	const pinnedBadge = translate(
		i18n,
		"scratchpad.pinnedBadge",
		`[pinned to ${pinned ?? ""}]`,
		{ macro: pinned ?? "" },
	);

	const lineModels: readonly TuiScratchpadLineModel[] = authoredLines.map(
		(text, index) => {
			const projection = projected[index];
			const isActive = cursor.line === index;
			const isSelected =
				isVisualMode && index >= minSelectedLine && index <= maxSelectedLine;
			const hasError =
				projection && !projection.isValid && projection.diagnostics.length > 0;
			const isPinned = pinned && projection?.macroName === pinned;

			return {
				id: String(index),
				lineNumber: String(index + 1).padStart(2, "0"),
				text,
				projection: projection?.preview?.text,
				diagnostic: hasError ? projection.diagnostics[0]?.message : undefined,
				state: isActive
					? "active"
					: isSelected
						? "selected"
						: isPinned
							? "pinned"
							: projection?.isValid
								? "valid"
								: hasError
									? "invalid"
									: "normal",
			};
		},
	);
	const geometry = createScratchpadGeometry(lineModels, true);
	const pointerLine = (event: MouseEvent) =>
		clampOffset(scratchpadLineAtY(geometry, viewportOffset, event.y));
	const pointerCol = (event: MouseEvent) =>
		scratchpadColumnAtX(geometry, event.x);
	const handleMouseDown = (event: MouseEvent) => {
		if (event.button !== 0) return;
		const line = pointerLine(event);
		workspace.layout.setFocusedPane("main");
		workspace.editor.clickAt(line, pointerCol(event));
		revealLine(line);
	};
	const handleMouseDrag = (event: MouseEvent) => {
		if (!event.isDragging || event.button !== 0) return;
		const line = pointerLine(event);
		workspace.editor.dragSelection(workspace.editor.buffer.getCursor(), {
			line,
			col: pointerCol(event),
		});
		revealLine(line);
	};
	const handleMouseScroll = (event: MouseEvent) => {
		if (event.type !== "scroll" || !event.scroll) return;
		const direction =
			event.scroll.direction === "down" || event.scroll.direction === "right"
				? 1
				: -1;
		setViewportOffset((current) =>
			clampOffset(current + direction * Math.max(1, event.scroll?.delta ?? 1)),
		);
	};

	return (
		<box flexDirection="column">
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

			<TuiScratchpadBody
				lines={lineModels}
				viewportOffset={viewportOffset}
				viewportSize={viewportSize}
				onMouseDown={handleMouseDown}
				onMouseDrag={handleMouseDrag}
				onMouseScroll={handleMouseScroll}
				activeLineId={String(cursor.line)}
				theme={theme}
				renderAuthoredContent={(line) => {
					const index = Number(line.id);
					const text = authoredLines[index] ?? "";
					const isPinnedLine = Boolean(
						pinned && projected[index]?.macroName === pinned,
					);
					if (index !== cursor.line) {
						return (
							<box flexDirection="row">
								<text
									fg={line.state === "selected" ? c.fgPrimary : c.fgSecondary}
									attributes={
										line.state === "selected" ? TextAttributes.BOLD : 0
									}
								>
									{text || " "}
								</text>
								{isPinnedLine && (
									<text fg={c.accentAmber} attributes={TextAttributes.DIM}>
										{"  "}
										{pinnedBadge}
									</text>
								)}
							</box>
						);
					}

					const beforeCursor = text.slice(0, cursor.col);
					const cursorChar = text.slice(cursor.col, cursor.col + 1) || " ";
					const afterCursor = text.slice(cursor.col + 1);
					if (isEmptyBuffer) {
						return (
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
						);
					}

					return (
						<box flexDirection="row">
							{beforeCursor && (
								<text fg={c.fgPrimary} attributes={TextAttributes.BOLD}>
									{beforeCursor}
								</text>
							)}
							<TuiCursor char={cursorChar} theme={theme} />
							{afterCursor && (
								<text fg={c.fgPrimary} attributes={TextAttributes.BOLD}>
									{afterCursor}
								</text>
							)}
							{isPinnedLine && (
								<text fg={c.accentAmber} attributes={TextAttributes.DIM}>
									{"  "}
									{pinnedBadge}
								</text>
							)}
						</box>
					);
				}}
				renderProjectionContent={(line) => {
					const projection = projected[Number(line.id)];
					if (line.diagnostic) {
						return <text fg={c.statusError}>! {line.diagnostic}</text>;
					}
					if (projection?.preview) {
						return (
							<text fg={projection.isValid ? c.statusSuccess : c.statusWarning}>
								↳ {projection.preview.text}
							</text>
						);
					}
					return (
						<text fg={c.fgMuted} attributes={TextAttributes.DIM}>
							{" "}
						</text>
					);
				}}
			/>
		</box>
	);
}
