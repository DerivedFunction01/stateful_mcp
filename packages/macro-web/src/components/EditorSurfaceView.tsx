import type {
	EditorMode,
	ScratchpadLineDto,
} from "@stateful-mcp/macro-protocol";
import { AlertTriangle, Check, Circle, Pin, Play } from "lucide-react";
import {
	type ReactNode,
	type RefObject,
	useEffect,
	useRef,
	useState,
} from "react";
import type {
	BrowserEditorSurfaceAdapter,
	BrowserVimKeyboardEvent,
	CellRange,
	EditorSearchResult,
} from "../lib/browser-vim";
import { useI18n } from "../lib/macro-i18n-provider";

export interface EditorSurfaceViewHandle {
	readonly element: HTMLElement | null;
	readonly adapter: BrowserEditorSurfaceAdapter | undefined;
}

export interface EditorSurfaceViewProps {
	readonly documentId: string;
	readonly lines: readonly ScratchpadLineDto[];
	readonly draft?: readonly string[];
	readonly pinnedMacroIds?: readonly string[];
	readonly disabled?: boolean;
	readonly activeCellIndex?: number;
	readonly selectedCellRange?: CellRange | null;
	readonly vimEnabled?: boolean;
	readonly vimMode?: EditorMode;
	readonly onTextChange: (lines: readonly string[]) => void;
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
	readonly searchWidget?: ReactNode;
}

function normalizeText(text: string): string {
	return text.replace(/\r\n?/g, "\n");
}

function textFromSurface(element: HTMLElement): string {
	return linesFromSurface(element).join("\n");
}

function linesFromSurface(element: HTMLElement): string[] {
	const blocks = [...element.children].filter(
		(child): child is HTMLElement => child instanceof HTMLElement,
	);
	return (blocks.length ? blocks : [element]).map((block) =>
		normalizeText(block.textContent ?? ""),
	);
}

export interface EditorVisualRow {
	readonly logicalLineIndex: number;
	readonly segmentIndex: number;
	readonly displayLineNumber: number;
	readonly text: string;
	readonly isCellStart: boolean;
	readonly isCellEnd: boolean;
}

export function createEditorVisualRows(
	lines: readonly string[],
): readonly EditorVisualRow[] {
	const rows: EditorVisualRow[] = [];
	for (const [logicalLineIndex, line] of lines.entries()) {
		const segments = normalizeText(line).split("\n");
		segments.forEach((text, segmentIndex) => {
			rows.push({
				logicalLineIndex,
				segmentIndex,
				displayLineNumber: rows.length + 1,
				text,
				isCellStart: segmentIndex === 0,
				isCellEnd: segmentIndex === segments.length - 1,
			});
		});
	}
	return rows.length > 0
		? rows
		: [
				{
					logicalLineIndex: 0,
					segmentIndex: 0,
					displayLineNumber: 1,
					text: "",
					isCellStart: true,
					isCellEnd: true,
				},
			];
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
				range.endContainer.nodeType === Node.TEXT_NODE ? range.endOffset : 0;
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

function insertTextAtSelection(
	root: HTMLElement,
	text: string,
): string[] | null {
	const selection = window.getSelection();
	if (!selection || selection.rangeCount === 0) return null;
	const range = selection.getRangeAt(0);
	if (!root.contains(range.commonAncestorContainer)) return null;
	range.deleteContents();
	const node = document.createTextNode(text);
	range.insertNode(node);
	range.setStartAfter(node);
	range.collapse(true);
	selection.removeAllRanges();
	selection.addRange(range);
	return linesFromSurface(root);
}

function splitCellAtSelection(root: HTMLElement): string[] | null {
	const { lineIdx, col } = getActiveLineAndCol(root);
	const block = root.children[lineIdx] as HTMLElement | undefined;
	if (!block) return null;
	const text = block.textContent ?? "";
	const splitAt = Math.max(0, Math.min(text.length, col));
	const before = text.slice(0, splitAt);
	const after = text.slice(splitAt);
	block.textContent = before;
	if (!before) block.appendChild(document.createElement("br"));
	const next = document.createElement("div");
	next.className = "editor-line-row";
	next.dataset.editorLine = String(lineIdx + 2);
	next.textContent = after;
	if (!after) next.appendChild(document.createElement("br"));
	block.after(next);
	[...root.children].forEach((child, index) => {
		if (child instanceof HTMLElement)
			child.dataset.editorLine = String(index + 1);
	});
	setLineAndCol(root, lineIdx + 1, 0);
	return linesFromSurface(root);
}

function pointerPosition(
	root: HTMLElement,
	event: React.PointerEvent<HTMLElement>,
): { lineIdx: number; col: number } {
	const target = event.target instanceof Element ? event.target : null;
	const line = target?.closest<HTMLElement>(
		".editor-line-row, [data-line-number]",
	);
	const cell = target?.closest<HTMLElement>("[data-cell-index]");
	const targetLineIdx = line?.classList.contains("editor-line-row")
		? Number(line.dataset.editorLine ?? 1) - 1
		: Number(line?.dataset.lineNumber ?? 1) - 1;
	const lineIdx =
		cell?.dataset.cellIndex !== undefined
			? Number(cell.dataset.cellIndex)
			: line
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
	const block: HTMLElement | null =
		range.startContainer instanceof Element
			? range.startContainer.closest(".editor-line-row")
			: (range.startContainer.parentElement?.closest(".editor-line-row") ??
				null);
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
	lines,
	draft,
	pinnedMacroIds = [],
	disabled = false,
	activeCellIndex,
	selectedCellRange: selectedCellRangeProp = null,
	vimEnabled = false,
	vimMode,
	searchWidget,
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
	const sourceLines = draft ?? lines.map((line) => line.rawText);
	const visualRows = createEditorVisualRows(sourceLines);
	const totalVisualLineCount = visualRows.length;
	const visualRowsByCell = sourceLines.map((_, logicalLineIndex) =>
		visualRows.filter((row) => row.logicalLineIndex === logicalLineIndex),
	);
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
		const sourceKey = JSON.stringify(sourceLines);
		if (lastRenderedText.current === sourceKey) return;
		root.replaceChildren(
			...sourceLines.map((line, index) => {
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
		lastRenderedText.current = sourceKey;
	}, [sourceLines]);

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
					authored.focus();
				}
				if (vimEnabled) {
					onPointerTarget?.(point.lineIdx, point.col, false);
				}
				if (!vimOwnsCaret && !authored.contains(event.target as Node)) {
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
				if (
					pointerDownRef.current === event.pointerId &&
					vimEnabled &&
					vimMode === "INSERT"
				) {
					const authored = rootRef.current;
					if (authored) {
						const point = pointerPosition(authored, event);
						onPointerTarget?.(point.lineIdx, point.col, false);
					}
				}
				if (pointerDownRef.current === event.pointerId)
					pointerDownRef.current = null;
				event.currentTarget.releasePointerCapture?.(event.pointerId);
			}}
			onPointerCancel={() => {
				pointerDownRef.current = null;
			}}
		>
			{searchWidget}
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
							const handled = onKeyDown?.(event) ?? false;
							if (handled) {
								event.preventDefault();
								if (vimMode === "INSERT") updateCursor();
							}
						}}
						onInput={() => {
							const next = linesFromSurface(rootRef.current!);
							lastRenderedText.current = JSON.stringify(next);
							onTextChange(next);
							updateCursor();
						}}
						onKeyUp={updateCursor}
						onSelect={updateCursor}
						onScroll={updateCursor}
					/>

					{/* Synchronized Gutter & Per-Cell Companion Outputs */}
					<div className="editor-cell-decorations" aria-hidden="true">
						{sourceLines.map((_, cellIdx) => {
							const cellRows = visualRowsByCell[cellIdx] ?? [];
							const lineDto = lines.find((l) => l.lineNumber === cellIdx + 1);
							const isLineActive =
								activeCellIndex !== undefined
									? activeCellIndex === cellIdx
									: activeLineNumber === cellIdx + 1;
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
								selectedCellRangeProp !== null && activeCellIndex === cellIdx;
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
									key={cellIdx}
									className={`editor-cell-unit ${isLineActive ? "active" : ""} ${isCellSelected ? "cell-selected" : ""} ${isPinned ? "pinned" : ""} ${lineDto?.lineStatus ?? "normal"} ${hasOutput ? "has-output" : ""}`}
									data-cell-index={cellIdx}
									data-logical-line-number={cellIdx + 1}
									data-visual-rows={cellRows.length}
									style={{
										minHeight: `${Math.max(1, cellRows.length) * 24}px`,
									}}
								>
									{/* One physical gutter row per visual segment; the cell unit remains logical. */}
									<div className="editor-cell-gutter-rows">
										{cellRows.map((row) => (
											<div
												key={row.displayLineNumber}
												className={`editor-cell-gutter ${row.isCellStart ? "cell-start" : "cell-continuation"}`}
												data-line-number={row.displayLineNumber}
											>
												<span className="gutter-marker">
													{row.isCellStart
														? isVisualEndpoint
															? "▌"
															: isLineActive
																? "▎"
																: isCellSelected
																	? "│"
																	: " "
														: isLineActive || isCellSelected
															? "│"
															: " "}
												</span>
												<span
													className={`gutter-sign ${hasError ? "error" : isPinned ? "pinned" : (lineDto?.lineStatus ?? "")}`}
												>
													{row.isCellStart && hasError ? (
														<AlertTriangle size={12} />
													) : row.isCellStart && isValid ? (
														<Check size={12} />
													) : row.isCellStart && isLineActive ? (
														<Circle size={7} fill="currentColor" />
													) : null}
												</span>
												<span className="gutter-number">
													{String(row.displayLineNumber).padStart(
														Math.max(2, String(totalVisualLineCount).length),
														"0",
													)}
												</span>
												<span className="gutter-border">│</span>
											</div>
										))}
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
																onExecuteLine?.(cellIdx + 1);
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
	onTextChange: (lines: readonly string[]) => void,
	options?: {
		readonly documentId?: string;
		readonly textRevision?: number;
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
	let lastMatch: { cell: number; start: number; end: number } | null = null;
	let lastSearch: string | null = null;

	const getFullLines = () => linesFromSurface(element);

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
		getCellText: (index: number) => getFullLines()[index] ?? "",

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
				onTextChange([""]);
				setLineAndCol(element, 0, 0);
			} else {
				lines.splice(targetIdx, 1);
				onTextChange(lines);
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
			onTextChange(lines);
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
			onTextChange(lines);
			setLineAndCol(element, insertIdx, 0);
		},

		splitCellAtCaret: () => {
			const next = splitCellAtSelection(element);
			if (next) onTextChange(next);
		},

		insertTextAtCaret: (text: string) => {
			const next = insertTextAtSelection(element, text);
			if (next) onTextChange(next);
		},

		searchText: (
			query: string,
			direction: "forward" | "backward",
		): EditorSearchResult => {
			const lines = getFullLines();
			const matches = lines.flatMap((text, logicalLineIndex) => {
				const result: {
					logicalLineIndex: number;
					startOffset: number;
					endOffset: number;
				}[] = [];
				if (!query) return result;
				let start = 0;
				while (start <= text.length) {
					const found = text.indexOf(query, start);
					if (found === -1) break;
					result.push({
						logicalLineIndex,
						startOffset: found,
						endOffset: found + query.length,
					});
					start = found + Math.max(1, query.length);
				}
				return result;
			});
			lastSearch = query;
			syncFromDom();
			const activeIndex = matches.findIndex((match) =>
				direction === "forward"
					? match.logicalLineIndex > currentCellIdx ||
						(match.logicalLineIndex === currentCellIdx &&
							match.startOffset >= currentCol)
					: match.logicalLineIndex < currentCellIdx ||
						(match.logicalLineIndex === currentCellIdx &&
							match.endOffset <= currentCol),
			);
			const selectedIndex =
				activeIndex === -1 ? (matches.length > 0 ? 0 : -1) : activeIndex;
			const selected = selectedIndex >= 0 ? matches[selectedIndex] : undefined;
			if (selected) {
				lastMatch = {
					cell: selected.logicalLineIndex,
					start: selected.startOffset,
					end: selected.endOffset,
				};
				currentCellIdx = selected.logicalLineIndex;
				currentCol = selected.startOffset;
				setLineAndCol(element, currentCellIdx, currentCol);
			}
			return {
				documentId: options?.documentId ?? "",
				textRevision: options?.textRevision ?? 0,
				matches,
				activeMatchIndex: selectedIndex,
			};
		},

		findText: (query: string, direction: "forward" | "backward") => {
			const needle = query;
			if (!needle) return false;
			lastSearch = needle;
			syncFromDom();
			const lines = getFullLines();
			const count = lines.length;
			for (let step = 0; step < count; step += 1) {
				const index =
					direction === "forward"
						? (currentCellIdx + step) % count
						: (currentCellIdx - step + count) % count;
				const text = lines[index] ?? "";
				const start =
					direction === "forward"
						? text.indexOf(needle, step === 0 ? currentCol : 0)
						: text.lastIndexOf(
								needle,
								step === 0 ? currentCol - 1 : text.length,
							);
				if (start !== -1) {
					lastMatch = { cell: index, start, end: start + needle.length };
					currentCellIdx = index;
					currentCol = start;
					setLineAndCol(element, index, start);
					return true;
				}
			}
			return false;
		},

		repeatFind: (direction: "forward" | "backward") =>
			lastSearch !== null &&
			Boolean(
				getFullLines().length > 0 &&
					// Reuse the same match implementation while advancing from the current caret.
					(() => {
						const needle = lastSearch;
						if (!needle) return false;
						syncFromDom();
						const lines = getFullLines();
						const count = lines.length;
						for (let step = 0; step < count; step += 1) {
							const index =
								direction === "forward"
									? (currentCellIdx + step) % count
									: (currentCellIdx - step + count) % count;
							const text = lines[index] ?? "";
							const start =
								direction === "forward"
									? text.indexOf(needle, step === 0 ? currentCol + 1 : 0)
									: text.lastIndexOf(
											needle,
											step === 0 ? currentCol - 1 : text.length,
										);
							if (start !== -1) {
								lastMatch = { cell: index, start, end: start + needle.length };
								currentCellIdx = index;
								currentCol = start;
								setLineAndCol(element, index, start);
								return true;
							}
						}
						return false;
					})(),
			),

		replaceCurrentMatch: (query: string, replacement: string) => {
			if (
				!lastMatch ||
				getFullLines()[lastMatch.cell]?.slice(
					lastMatch.start,
					lastMatch.end,
				) !== query
			)
				return false;
			const lines = getFullLines();
			const text = lines[lastMatch.cell] ?? "";
			lines[lastMatch.cell] =
				text.slice(0, lastMatch.start) +
				replacement +
				text.slice(lastMatch.end);
			const nextColumn = lastMatch.start + replacement.length;
			lastMatch = {
				cell: lastMatch.cell,
				start: lastMatch.start,
				end: nextColumn,
			};
			currentCellIdx = lastMatch.cell;
			currentCol = nextColumn;
			onTextChange(lines);
			setLineAndCol(element, currentCellIdx, currentCol);
			return true;
		},

		replaceAllMatches: (query: string, replacement: string) => {
			if (!query) return 0;
			const lines = getFullLines();
			let count = 0;
			for (let index = 0; index < lines.length; index += 1) {
				const text = lines[index] ?? "";
				const matches = text.split(query).length - 1;
				if (matches > 0) {
					lines[index] = text.split(query).join(replacement);
					count += matches;
				}
			}
			if (count > 0) {
				lastMatch = null;
				onTextChange(lines);
			}
			return count;
		},

		pasteCell: (text: string, position: "above" | "below") => {
			const { lineIdx } = getActiveLineAndCol(element);
			const lines = getFullLines();
			const pasteLines = text.split("\n");
			const insertIdx = position === "below" ? lineIdx + 1 : lineIdx;
			lines.splice(insertIdx, 0, ...pasteLines);
			onTextChange(lines);
			setLineAndCol(element, insertIdx, 0);
		},

		pasteCellRangeReplace: (start: number, end: number, text: string) => {
			const lines = getFullLines();
			const minIdx = Math.max(0, Math.min(start, end));
			const maxIdx = Math.min(lines.length - 1, Math.max(start, end));
			const replacement = text.split("\n");
			lines.splice(minIdx, maxIdx - minIdx + 1, ...replacement);
			onTextChange(lines);
			setLineAndCol(element, minIdx, 0);
		},

		executeCell: (index?: number) => {
			const targetLine = (index ?? getActiveLineAndCol(element).lineIdx) + 1;
			options?.onExecuteLine?.(targetLine);
		},

		executeCellRange: (start: number, end: number) => {
			const startLine = Math.min(start, end) + 1;
			const endLine = Math.max(start, end) + 1;
			options?.onExecuteRange?.(startLine, endLine);
		},

		focusCellForEdit: (index?: number, column?: number) => {
			if (index !== undefined) setLineAndCol(element, index, column ?? 0);
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
			const currentLines = getFullLines();
			currentLines[lineIdx] =
				`${currentLines[lineIdx]?.slice(0, col) ?? ""}${text}${currentLines[lineIdx]?.slice(col) ?? ""}`;
			onTextChange(currentLines);
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
				onTextChange([""]);
				setLineAndCol(element, 0, 0);
			} else {
				lines.splice(lineIdx, 1);
				onTextChange(lines);
				setLineAndCol(element, Math.min(lineIdx, lines.length - 1), 0);
			}
		},
		insertLine: (position: "above" | "below") => {
			const { lineIdx } = getActiveLineAndCol(element);
			const lines = getFullLines();
			const insertIdx = position === "below" ? lineIdx + 1 : lineIdx;
			lines.splice(insertIdx, 0, "");
			onTextChange(lines);
			setLineAndCol(element, insertIdx, 0);
		},
		focus: () => element.focus(),
	};
}
