import type { ScratchpadLineDto } from "@stateful-mcp/macro-protocol";
import { AlertTriangle, Check, Circle, Pin, Play } from "lucide-react";
import { type RefObject, useEffect, useRef, useState } from "react";
import type { EditorMode } from "@stateful-mcp/macro-protocol";
import type {
	BrowserEditorSurfaceAdapter,
	BrowserVimKeyboardEvent,
	CellRange,
} from "../lib/browser-vim";
import { useI18n } from "../lib/macro-i18n-provider";

export interface EditorSurfaceViewHandle {
	readonly element: HTMLElement | null;
	readonly adapter: BrowserEditorSurfaceAdapter | undefined;
}

export interface EditorSurfaceViewProps {
	readonly documentId: string;
	readonly text: string;
	readonly lines: readonly ScratchpadLineDto[];
	readonly draft?: string;
	readonly pinnedMacroIds?: readonly string[];
	readonly disabled?: boolean;
	readonly activeCellIndex?: number;
	readonly selectedCellRange?: CellRange | null;
	readonly vimEnabled?: boolean;
	readonly vimMode?: EditorMode;
	readonly onTextChange: (text: string) => void;
	readonly onFocusChange?: (focused: boolean) => void;
	readonly onCursorChange?: (cursor: string) => void;
	readonly onPointerTarget?: (
		lineIndex: number,
		column: number,
		dragging: boolean,
	) => void;
	readonly onKeyDown?: (event: BrowserVimKeyboardEvent) => boolean;
	readonly onExecuteLine?: (lineNumber: number) => void;
	readonly onExecuteRange?: (startLine: number, endLine: number) => void;
	readonly onPinMacro?: (macroId: string | null) => void;
	readonly surfaceRef?: RefObject<HTMLElement | null>;
}

function normalizeText(text: string): string {
	return text.replace(/\r\n?/g, "\n");
}

function textFromSurface(element: HTMLElement): string {
	const blocks = [...element.children].filter(
		(child): child is HTMLElement => child instanceof HTMLElement,
	);
	return normalizeText(
		(blocks.length ? blocks : [element])
			.map((block) => block.textContent ?? "")
			.join("\n"),
	);
}

function offsetAtPoint(root: HTMLElement, node: Node, offset: number): number {
	const range = document.createRange();
	range.selectNodeContents(root);
	range.setEnd(node, offset);
	return range.toString().length;
}

function getActiveLineAndCol(root: HTMLElement): {
	lineIdx: number;
	col: number;
} {
	const selection = window.getSelection();
	if (!selection || selection.rangeCount === 0) return { lineIdx: 0, col: 0 };
	const range = selection.getRangeAt(0);
	if (range.endContainer === root) {
		const lineIdx = Math.max(
			0,
			Math.min(root.children.length - 1, range.endOffset),
		);
		return { lineIdx, col: 0 };
	}

	let node: Node | null = range.endContainer;
	while (node && node !== root && node.parentElement !== root) {
		node = node.parentElement;
	}
	if (node && node.parentElement === root) {
		const lineIdx = Array.prototype.indexOf.call(root.children, node);
		if (lineIdx !== -1) {
			const col =
				range.endContainer.nodeType === Node.TEXT_NODE
					? range.endOffset
					: 0;
			return { lineIdx, col };
		}
	}

	// Fallback to text offset if child block wasn't directly found
	const fullText = textFromSurface(root);
	const startOffset = offsetAtPoint(root, range.endContainer, range.endOffset);
	const beforeLines = fullText.slice(0, startOffset).split("\n");
	const lineIdx = Math.max(0, beforeLines.length - 1);
	const col = beforeLines[lineIdx]?.length ?? 0;
	return { lineIdx, col };
}

function setLineAndCol(root: HTMLElement, lineIdx: number, col = 0): void {
	const totalBlocks = root.children.length;
	if (totalBlocks === 0) return;
	const targetIdx = Math.max(0, Math.min(totalBlocks - 1, lineIdx));
	const block = root.children[targetIdx] as HTMLElement | undefined;
	if (!block) return;

	// Find the first text node in the block
	let textNode: Text | null = null;
	const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
	const first = walker.nextNode();
	if (first && first.nodeType === Node.TEXT_NODE) {
		textNode = first as Text;
	}

	const range = document.createRange();
	if (textNode) {
		const maxCol = (textNode.textContent ?? "").length;
		const finalOffset = Math.max(0, Math.min(maxCol, col));
		range.setStart(textNode, finalOffset);
		range.setEnd(textNode, finalOffset);
	} else {
		range.setStart(block, 0);
		range.setEnd(block, 0);
	}

	const selection = window.getSelection();
	selection?.removeAllRanges();
	selection?.addRange(range);
}

function pointerPosition(
	root: HTMLElement,
	event: React.PointerEvent<HTMLElement>,
): { lineIdx: number; col: number } {
	const target = event.target instanceof Element ? event.target : null;
	const line = target?.closest<HTMLElement>(".editor-line-row, [data-line-number]");
	const targetLineIdx = line?.classList.contains("editor-line-row")
		? Number(line.dataset.editorLine ?? 1) - 1
		: Number(line?.dataset.lineNumber ?? 1) - 1;
	const lineIdx = line
		? targetLineIdx
		: Math.floor(
				(event.clientY - root.getBoundingClientRect().top - 10) / 24,
			);
	const fallback = { lineIdx: Math.max(0, lineIdx), col: 0 };
	const documentWithCaret = document as Document & {
		caretRangeFromPoint?: (x: number, y: number) => Range | null;
	};
	const range = documentWithCaret.caretRangeFromPoint?.(
		event.clientX,
		event.clientY,
	);
	if (!range || !root.contains(range.startContainer)) return fallback;
	let block: HTMLElement | null =
		range.startContainer instanceof Element
			? range.startContainer.closest(".editor-line-row")
			: range.startContainer.parentElement?.closest(".editor-line-row") ?? null;
	if (!block) return fallback;
	const local = document.createRange();
	local.selectNodeContents(block);
	local.setEnd(range.startContainer, range.startOffset);
	return {
		lineIdx: Number(block.dataset.editorLine ?? 1) - 1,
		col: local.toString().length,
	};
}

export function EditorSurfaceView({
	documentId,
	text,
	lines,
	draft,
	pinnedMacroIds = [],
	disabled = false,
	activeCellIndex,
	selectedCellRange: selectedCellRangeProp = null,
	vimEnabled = false,
	vimMode,
	onTextChange,
	onFocusChange,
	onCursorChange,
	onPointerTarget,
	onKeyDown,
	onExecuteLine,
	onExecuteRange,
	onPinMacro,
	surfaceRef,
}: EditorSurfaceViewProps) {
	const { t } = useI18n();
	const rootRef = useRef<HTMLDivElement | null>(null);
	const focusedRef = useRef(false);
	const lastRenderedText = useRef<string | undefined>(undefined);
	const [activeLineNumber, setActiveLineNumber] = useState<number>(1);
	const sourceText = draft ?? text;
	const textLines = sourceText.split("\n");
	const totalLineCount = Math.max(textLines.length, lines.length, 1);
	const pointerDownRef = useRef<number | null>(null);
	const vimOwnsCaret = vimEnabled && vimMode !== "INSERT";

	const updateCursor = () => {
		const root = rootRef.current;
		if (!root) return;
		const { lineIdx, col } = getActiveLineAndCol(root);
		const currentLine = lineIdx + 1;
		const currentColumn = col + 1;
		setActiveLineNumber(currentLine);
		onCursorChange?.(`${currentLine}:${currentColumn}`);
	};

	useEffect(() => {
		const root = rootRef.current;
		if (!root || focusedRef.current) return;
		if (lastRenderedText.current === sourceText) return;
		root.replaceChildren(
			...sourceText.split("\n").map((line, index) => {
				const block = document.createElement("div");
				block.className = "editor-line-row";
				block.dataset.editorLine = String(index + 1);
				block.textContent = line.length > 0 ? line : "";
				if (line.length === 0) {
					const br = document.createElement("br");
					block.appendChild(br);
				}
				return block;
			}),
		);
		lastRenderedText.current = sourceText;
	}, [sourceText]);

	return (
		<div
			className="editor-surface-view"
			data-document-id={documentId}
			onPointerDown={(event) => {
			const authored = rootRef.current;
			if (!authored) return;
			const target = event.target instanceof Element ? event.target : null;
			if (target?.closest("button, a, input, textarea, select")) return;
			const point = pointerPosition(authored, event);
			pointerDownRef.current = event.pointerId;
			event.currentTarget.setPointerCapture?.(event.pointerId);
			if (vimOwnsCaret) {
				event.preventDefault();
				onPointerTarget?.(point.lineIdx, point.col, false);
				authored.focus();
			} else if (!authored.contains(event.target as Node)) {
				authored.focus();
			}
		}}
		onPointerMove={(event) => {
			if (pointerDownRef.current !== event.pointerId || !vimOwnsCaret) return;
			const authored = rootRef.current;
			if (!authored) return;
			const point = pointerPosition(authored, event);
			event.preventDefault();
			onPointerTarget?.(point.lineIdx, point.col, true);
		}}
		onPointerUp={(event) => {
			if (pointerDownRef.current === event.pointerId)
				pointerDownRef.current = null;
			event.currentTarget.releasePointerCapture?.(event.pointerId);
		}}
		onPointerCancel={() => {
			pointerDownRef.current = null;
		}}
		>
			<div className="editor-canvas">
				{/* Lined Cells Container: Hybrid Jupyter/Editor per-cell companion layout */}
				<div className="editor-cells-wrapper">
					{/* Native Authored Text Surface (Overlaid / Synchronized) */}
					<div
						ref={(element) => {
							rootRef.current = element;
							if (surfaceRef) surfaceRef.current = element;
						}}
						className={`editor-authored-input ${vimOwnsCaret ? "vim-native-caret-hidden" : ""}`}
						contentEditable={disabled ? false : "plaintext-only"}
						spellCheck={false}
						suppressContentEditableWarning
						onFocus={() => {
							focusedRef.current = true;
							onFocusChange?.(true);
							updateCursor();
						}}
						onBlur={() => {
							focusedRef.current = false;
							onFocusChange?.(false);
						}}
						onKeyDown={(event) => {
							if (onKeyDown?.(event)) event.preventDefault();
						}}
						onInput={() => {
							const next = textFromSurface(rootRef.current!);
							lastRenderedText.current = next;
							onTextChange(next);
							updateCursor();
						}}
						onKeyUp={updateCursor}
						onSelect={updateCursor}
						onScroll={updateCursor}
					/>

					{/* Synchronized Gutter & Per-Cell Companion Outputs */}
					<div className="editor-cell-decorations" aria-hidden="true">
						{Array.from({ length: totalLineCount }).map((_, index) => {
							const lineNum = index + 1;
							const cellIdx = index;
							const lineDto = lines.find((l) => l.lineNumber === lineNum);
							const isLineActive =
								activeCellIndex !== undefined
									? activeCellIndex === cellIdx
									: activeLineNumber === lineNum;
							const isCellSelected =
								selectedCellRangeProp !== null &&
								cellIdx >=
									Math.min(
										selectedCellRangeProp.start,
										selectedCellRangeProp.end,
									) &&
								cellIdx <=
									Math.max(
										selectedCellRangeProp.start,
										selectedCellRangeProp.end,
									);
							const isVisualEndpoint =
								selectedCellRangeProp !== null &&
								activeCellIndex === cellIdx;
							const diagnostic = lineDto?.diagnostics?.[0];
							const projectionText =
								lineDto?.preview?.text ?? lineDto?.executionPreview?.text;
							const hasError =
								lineDto?.lineStatus === "invalid" || Boolean(diagnostic);
							const isPinned = Boolean(
								lineDto?.macroName &&
									pinnedMacroIds.includes(lineDto.macroName),
							);
							const isValid = lineDto?.lineStatus === "valid";

							// Only show cell output when there's an actual diagnostic, preview, or macro match
							const hasOutput = Boolean(
								diagnostic ||
									projectionText ||
									(lineDto?.macroName && lineDto.lineStatus !== "empty"),
							);

							return (
								<div
									key={lineNum}
									className={`editor-cell-unit ${isLineActive ? "active" : ""} ${isCellSelected ? "cell-selected" : ""} ${lineDto?.lineStatus ?? "normal"} ${hasOutput ? "has-output" : ""}`}
									data-cell-index={cellIdx}
									data-line-number={lineNum}
								>
									{/* Gutter cell aligned with the authored text line */}
									<div className="editor-cell-gutter">
										<span className="gutter-marker">
											{isVisualEndpoint ? "▌" : isLineActive ? "▎" : isCellSelected ? "│" : " "}
										</span>
										<span
											className={`gutter-sign ${hasError ? "error" : isPinned ? "pinned" : (lineDto?.lineStatus ?? "")}`}
										>
											{hasError ? (
												<AlertTriangle size={12} />
											) : isPinned ? (
												<Pin size={12} />
											) : isValid ? (
												<Check size={12} />
											) : isLineActive ? (
												<Circle size={7} fill="currentColor" />
											) : null}
										</span>
										<span className="gutter-number">
											{String(lineNum).padStart(
												Math.max(2, String(totalLineCount).length),
												"0",
											)}
										</span>
										<span className="gutter-border">│</span>
									</div>

									{/* Per-line Companion Cell Output (Hybrid Jupyter Output) */}
									{hasOutput && (
										<div
											className={`editor-cell-output ${lineDto?.lineStatus ?? ""}`}
										>
											<div className="cell-output-gutter">
												<span className="gutter-border">│</span>
											</div>
											<div className="cell-output-body">
												<div className="cell-output-content">
													{diagnostic ? (
														<span className="cell-diagnostic-message">
															{diagnostic.message}
														</span>
													) : projectionText ? (
														<span className="cell-projection-preview">
															{projectionText}
														</span>
													) : null}
												</div>
												<div className="cell-output-actions">
													{lineDto?.macroName && !isPinned && (
														<button
															type="button"
															className="cell-action-btn pin"
															title={t("editor.pinMacro")}
															onClick={(e) => {
																e.stopPropagation();
																onPinMacro?.(lineDto.macroName ?? null);
															}}
														>
															<Pin size={12} />
														</button>
													)}
													{isValid && (
														<button
															type="button"
															className="cell-action-btn run"
															title={t("editor.runCell")}
															onClick={(e) => {
																e.stopPropagation();
																onExecuteLine?.(lineNum);
															}}
														>
															<Play size={12} />
														</button>
													)}
												</div>
											</div>
										</div>
									)}
								</div>
							);
						})}
					</div>
				</div>
			</div>
		</div>
	);
}

export function getEditorSurfaceAdapter(
	element: HTMLElement | null,
	onTextChange: (text: string) => void,
	options?: {
		readonly getSelectedCellRange?: () => CellRange | null;
		readonly setSelectedCellRange?: (range: CellRange | null) => void;
		readonly onExecuteLine?: (lineNumber: number) => void;
		readonly onExecuteRange?: (startLine: number, endLine: number) => void;
	},
): BrowserEditorSurfaceAdapter | undefined {
	if (!element) return undefined;
	let internalSelectedRange: CellRange | null = null;
	let currentCellIdx = 0;
	let currentCol = 0;

	const getFullLines = () => textFromSurface(element).split("\n");

	const syncFromDom = () => {
		const res = getActiveLineAndCol(element);
		currentCellIdx = res.lineIdx;
		currentCol = res.col;
		return res;
	};

	return {
		// ─── Cell-Aware Primitives ──────────────────────────────────────────
		getActiveCellIndex: () => {
			syncFromDom();
			return currentCellIdx;
		},
		setActiveCellIndex: (idx: number) => {
			const total = getFullLines().length;
			currentCellIdx = Math.max(0, Math.min(total - 1, idx));
			setLineAndCol(element, currentCellIdx, 0);
		},
		setCellCaret: (idx: number, col: number) => {
			const total = getFullLines().length;
			currentCellIdx = Math.max(0, Math.min(total - 1, idx));
			currentCol = Math.max(0, col);
			setLineAndCol(element, currentCellIdx, currentCol);
		},
		getCellCount: () => getFullLines().length,

		getSelectedCellRange: () =>
			options?.getSelectedCellRange
				? options.getSelectedCellRange()
				: internalSelectedRange,

		setSelectedCellRange: (range: CellRange | null) => {
			internalSelectedRange = range;
			options?.setSelectedCellRange?.(range);
		},

		moveCell: (delta: -1 | 1) => {
			syncFromDom();
			const total = getFullLines().length;
			currentCellIdx = Math.max(0, Math.min(total - 1, currentCellIdx + delta));
			setLineAndCol(element, currentCellIdx, currentCol);
		},

		extendCellSelection: (delta: -1 | 1) => {
			syncFromDom();
			const total = getFullLines().length;
			const next = Math.max(0, Math.min(total - 1, currentCellIdx + delta));
			currentCellIdx = next;
			setLineAndCol(element, next, currentCol);

			const existing = options?.getSelectedCellRange
				? options.getSelectedCellRange()
				: internalSelectedRange;
			const newRange = existing
				? { start: existing.start, end: next }
				: { start: currentCellIdx, end: next };

			internalSelectedRange = newRange;
			options?.setSelectedCellRange?.(newRange);
		},

		swapSelectionAnchor: () => {
			const existing = options?.getSelectedCellRange
				? options.getSelectedCellRange()
				: internalSelectedRange;
			if (existing) {
				const swapped = { start: existing.end, end: existing.start };
				internalSelectedRange = swapped;
				options?.setSelectedCellRange?.(swapped);
				setLineAndCol(element, swapped.end, 0);
			}
		},

		deleteCell: (index?: number) => {
			const targetIdx = index ?? getActiveLineAndCol(element).lineIdx;
			const lines = getFullLines();
			if (targetIdx < 0 || targetIdx >= lines.length) return "";
			const deleted = lines[targetIdx] ?? "";
			if (lines.length <= 1) {
				onTextChange("");
				setLineAndCol(element, 0, 0);
			} else {
				lines.splice(targetIdx, 1);
				onTextChange(lines.join("\n"));
				setLineAndCol(element, Math.min(targetIdx, lines.length - 1), 0);
			}
			return deleted;
		},

		deleteCellRange: (start: number, end: number) => {
			const lines = getFullLines();
			const minIdx = Math.max(0, Math.min(start, end));
			const maxIdx = Math.min(lines.length - 1, Math.max(start, end));
			const count = maxIdx - minIdx + 1;
			const deletedLines = lines.splice(minIdx, count);
			const newText = lines.length > 0 ? lines.join("\n") : "";
			onTextChange(newText);
			setLineAndCol(
				element,
				Math.min(minIdx, Math.max(0, lines.length - 1)),
				0,
			);
			return deletedLines.join("\n");
		},

		yankCell: (index?: number) => {
			const targetIdx = index ?? getActiveLineAndCol(element).lineIdx;
			const lines = getFullLines();
			return lines[targetIdx] ?? "";
		},

		yankCellRange: (start: number, end: number) => {
			const lines = getFullLines();
			const minIdx = Math.max(0, Math.min(start, end));
			const maxIdx = Math.min(lines.length - 1, Math.max(start, end));
			return lines.slice(minIdx, maxIdx + 1).join("\n");
		},

		insertCell: (position: "above" | "below", text = "") => {
			const { lineIdx } = getActiveLineAndCol(element);
			const lines = getFullLines();
			const insertIdx = position === "below" ? lineIdx + 1 : lineIdx;
			lines.splice(insertIdx, 0, text);
			onTextChange(lines.join("\n"));
			setLineAndCol(element, insertIdx, 0);
		},

		pasteCell: (text: string, position: "above" | "below") => {
			const { lineIdx } = getActiveLineAndCol(element);
			const lines = getFullLines();
			const pasteLines = text.split("\n");
			const insertIdx = position === "below" ? lineIdx + 1 : lineIdx;
			lines.splice(insertIdx, 0, ...pasteLines);
			onTextChange(lines.join("\n"));
			setLineAndCol(element, insertIdx, 0);
		},

		pasteCellRangeReplace: (start: number, end: number, text: string) => {
			const lines = getFullLines();
			const minIdx = Math.max(0, Math.min(start, end));
			const maxIdx = Math.min(lines.length - 1, Math.max(start, end));
			const replacement = text.split("\n");
			lines.splice(minIdx, maxIdx - minIdx + 1, ...replacement);
			onTextChange(lines.join("\n"));
			setLineAndCol(element, minIdx, 0);
		},

		executeCell: (index?: number) => {
			const targetLine =
				(index ?? getActiveLineAndCol(element).lineIdx) + 1;
			options?.onExecuteLine?.(targetLine);
		},

		executeCellRange: (start: number, end: number) => {
			const startLine = Math.min(start, end) + 1;
			const endLine = Math.max(start, end) + 1;
			options?.onExecuteRange?.(startLine, endLine);
		},

		focusCellForEdit: (index?: number) => {
			if (index !== undefined) setLineAndCol(element, index, 0);
			element.focus();
		},

		blurCellEdit: () => undefined,

		// ─── Text-Level Fallbacks ───────────────────────────────────────────
		getText: () => textFromSurface(element),
		getSelection: () => {
			const { lineIdx, col } = getActiveLineAndCol(element);
			const fullText = textFromSurface(element);
			const lines = fullText.split("\n");
			let offset = 0;
			for (let i = 0; i < lineIdx; i++) {
				offset += (lines[i]?.length ?? 0) + 1;
			}
			const target = offset + col;
			return { start: target, end: target };
		},
		setSelection: ({ start }) => {
			const fullText = textFromSurface(element);
			const before = fullText.slice(0, start).split("\n");
			const lineIdx = Math.max(0, before.length - 1);
			const col = before[lineIdx]?.length ?? 0;
			setLineAndCol(element, lineIdx, col);
		},
		replaceSelection: (text) => {
			const current = textFromSurface(element);
			const { lineIdx, col } = getActiveLineAndCol(element);
			const lines = current.split("\n");
			let offset = 0;
			for (let i = 0; i < lineIdx; i++) {
				offset += (lines[i]?.length ?? 0) + 1;
			}
			const currentPos = offset + col;
			const next = `${current.slice(0, currentPos)}${text}${current.slice(currentPos)}`;
			onTextChange(next);
		},
		moveLine: (delta: -1 | 1) => {
			const { lineIdx, col } = getActiveLineAndCol(element);
			const total = getFullLines().length;
			const next = Math.max(0, Math.min(total - 1, lineIdx + delta));
			setLineAndCol(element, next, col);
		},
		moveToLineBoundary: (boundary: "start" | "end") => {
			const { lineIdx } = getActiveLineAndCol(element);
			const lines = getFullLines();
			const lineLen = lines[lineIdx]?.length ?? 0;
			setLineAndCol(element, lineIdx, boundary === "start" ? 0 : lineLen);
		},
		deleteCurrentLine: () => {
			const { lineIdx } = getActiveLineAndCol(element);
			const lines = getFullLines();
			if (lines.length <= 1) {
				onTextChange("");
				setLineAndCol(element, 0, 0);
			} else {
				lines.splice(lineIdx, 1);
				onTextChange(lines.join("\n"));
				setLineAndCol(element, Math.min(lineIdx, lines.length - 1), 0);
			}
		},
		insertLine: (position: "above" | "below") => {
			const { lineIdx } = getActiveLineAndCol(element);
			const lines = getFullLines();
			const insertIdx = position === "below" ? lineIdx + 1 : lineIdx;
			lines.splice(insertIdx, 0, "");
			onTextChange(lines.join("\n"));
			setLineAndCol(element, insertIdx, 0);
		},
		focus: () => element.focus(),
	};
}
