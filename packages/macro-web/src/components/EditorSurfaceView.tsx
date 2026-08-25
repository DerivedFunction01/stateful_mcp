import type {
	EditorMode,
	InsertPosition,
	ScratchpadLineDto,
	SearchDirection,
} from "@stateful-mcp/macro-protocol";
import hljs from "highlight.js/lib/common";
import { AlertTriangle, Check, Circle, Play } from "lucide-react";
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
import type { InspectorDiagnosticItem } from "./inspector/inspector-types";
import { resolveDiagnosticMessage } from "./inspector/inspector-utils";

export interface EditorSurfaceViewHandle {
	readonly element: HTMLElement | null;
	readonly adapter: BrowserEditorSurfaceAdapter | undefined;
}

export interface EditorSurfaceViewProps {
	readonly documentId: string;
	readonly lines: readonly ScratchpadLineDto[];
	readonly draft?: readonly string[];
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
	readonly surfaceRef?: RefObject<HTMLElement | null>;
	readonly searchWidget?: ReactNode;
	readonly filePath?: string;
	readonly title?: string;
}

function normalizeText(text: string): string {
	return text.replace(/\r\n?/g, "\n");
}

export function detectLanguage(
	filePath?: string,
	title?: string,
): string | undefined {
	const name = filePath || title || "";
	const ext = name.split(".").pop()?.toLowerCase();
	switch (ext) {
		case "ts":
		case "tsx":
		case "mts":
		case "cts":
			return "typescript";
		case "js":
		case "jsx":
		case "mjs":
		case "cjs":
			return "javascript";
		case "json":
			return "json";
		case "py":
			return "python";
		case "sql":
			return "sql";
		case "md":
		case "markdown":
			return "markdown";
		case "css":
			return "css";
		case "html":
		case "xml":
		case "svg":
			return "xml";
		case "yaml":
		case "yml":
			return "yaml";
		case "sh":
		case "bash":
		case "zsh":
			return "bash";
		case "java":
			return "java";
		case "c":
		case "cpp":
		case "h":
		case "hpp":
			return "cpp";
		case "rs":
			return "rust";
		case "go":
			return "go";
		default:
			return undefined;
	}
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

function offsetInBlock(
	block: HTMLElement,
	targetNode: Node,
	targetOffset: number,
): number {
	const range = document.createRange();
	range.selectNodeContents(block);
	range.setEnd(targetNode, targetOffset);
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
	if (node && node.parentElement === root && node instanceof HTMLElement) {
		const lineIdx = Array.prototype.indexOf.call(root.children, node);
		if (lineIdx !== -1) {
			const col = offsetInBlock(node, range.endContainer, range.endOffset);
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

	let remaining = col;
	let targetNode: Node = block;
	let targetOffset = 0;
	let found = false;

	const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
	let textNode = walker.nextNode();
	while (textNode) {
		const len = textNode.textContent?.length ?? 0;
		if (remaining <= len) {
			targetNode = textNode;
			targetOffset = remaining;
			found = true;
			break;
		}
		remaining -= len;
		targetNode = textNode;
		targetOffset = len;
		textNode = walker.nextNode();
	}

	if (!found) {
		const br = block.querySelector("br");
		if (br) {
			targetNode = block;
			targetOffset = Array.prototype.indexOf.call(block.childNodes, br);
			if (targetOffset === -1) targetOffset = 0;
		} else if (block.lastChild && block.lastChild.nodeType === Node.TEXT_NODE) {
			targetNode = block.lastChild;
			targetOffset = targetNode.textContent?.length ?? 0;
		} else {
			const emptyNode = document.createTextNode("");
			block.appendChild(emptyNode);
			targetNode = emptyNode;
			targetOffset = 0;
		}
	}

	try {
		const range = document.createRange();
		range.setStart(targetNode, targetOffset);
		range.setEnd(targetNode, targetOffset);

		const selection = window.getSelection();
		selection?.removeAllRanges();
		selection?.addRange(range);
	} catch {
		// Fallback for edge cases
	}
}

function revealLine(root: HTMLElement, lineIdx: number): void {
	const block = root.children[lineIdx] as HTMLElement | undefined;
	block?.scrollIntoView({ block: "center", behavior: "smooth" });
}

function setSearchPosition(
	root: HTMLElement,
	lineIdx: number,
	col: number,
): void {
	const editorFocused =
		document.activeElement === root || root.contains(document.activeElement);
	if (!editorFocused) {
		revealLine(root, lineIdx);
		return;
	}
	setLineAndCol(root, lineIdx, col);
	revealLine(root, lineIdx);
}

function applySearchHighlights(
	root: HTMLElement,
	matches: readonly {
		logicalLineIndex: number;
		startOffset: number;
		endOffset: number;
	}[],
	activeMatchIndex: number,
) {
	if (typeof CSS === "undefined" || !("highlights" in CSS)) return;
	installSearchHighlightStyles();
	const matchRanges: Range[] = [];
	let currentRange: Range | null = null;
	const lineBlocks = root.querySelectorAll(".editor-line-row");

	matches.forEach((match, idx) => {
		const block = lineBlocks[match.logicalLineIndex];
		if (!block) return;
		let targetNode: Node | null = null;
		for (let i = 0; i < block.childNodes.length; i++) {
			const child = block.childNodes[i];
			if (child && child.nodeType === Node.TEXT_NODE) {
				targetNode = child;
				break;
			}
		}
		if (!targetNode) return;
		const nodeTextLen = targetNode.textContent?.length ?? 0;
		const start = Math.min(match.startOffset, nodeTextLen);
		const end = Math.min(match.endOffset, nodeTextLen);
		if (start >= end) return;
		try {
			const range = document.createRange();
			range.setStart(targetNode, start);
			range.setEnd(targetNode, end);
			if (idx === activeMatchIndex) {
				currentRange = range;
			} else {
				matchRanges.push(range);
			}
		} catch {
			// Range boundary fallback
		}
	});

	try {
		const cssWithHighlights = CSS as unknown as {
			highlights?: {
				set(name: string, highlight: unknown): void;
				delete(name: string): void;
			};
		};
		const HighlightCtor = (
			window as unknown as { Highlight?: new (...ranges: Range[]) => unknown }
		).Highlight;
		if (cssWithHighlights.highlights && HighlightCtor) {
			cssWithHighlights.highlights.set(
				"search-match",
				new HighlightCtor(...matchRanges),
			);
			if (currentRange) {
				cssWithHighlights.highlights.set(
					"search-current",
					new HighlightCtor(currentRange),
				);
			} else {
				cssWithHighlights.highlights.delete("search-current");
			}
		}
	} catch {
		// Browser fallback
	}
}

/**
 * The Custom Highlight API is not understood by older browsers' CSS parsers.
 * Add its rules only after feature detection so unsupported browsers do not
 * log invalid-selector warnings while still retaining the mark-based fallback
 * used by the rest of the search UI.
 */
function installSearchHighlightStyles(): void {
	if (typeof document === "undefined") return;
	if (document.querySelector("style[data-search-highlights]")) return;
	const highlights = CSS as unknown as {
		highlights?: unknown;
	};
	if (!highlights.highlights) return;
	const style = document.createElement("style");
	style.dataset.searchHighlights = "true";
	style.textContent =
		"::highlight(search-match) { background-color: rgba(245, 158, 11, 0.35); color: inherit; } " +
		"::highlight(search-current) { background-color: #f59e0b; color: #000000; }";
	try {
		document.head.appendChild(style);
	} catch {
		// The class-based search highlight remains available as a fallback.
	}
}

function clearSearchHighlights() {
	try {
		const cssWithHighlights = CSS as unknown as {
			highlights?: {
				delete(name: string): void;
			};
		};
		if (cssWithHighlights.highlights) {
			cssWithHighlights.highlights.delete("search-match");
			cssWithHighlights.highlights.delete("search-current");
		}
	} catch {
		// Browser fallback
	}
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

	// Find the containing .editor-line-row block
	let block: HTMLElement | null = null;
	let curr: Node | null = node;
	while (curr && curr !== root) {
		if (curr.parentElement === root && curr instanceof HTMLElement) {
			block = curr;
			break;
		}
		curr = curr.parentElement;
	}

	// In HTML pre-wrap, a trailing newline requires a trailing <br>
	// for the browser layout engine to render the subsequent line and allow caret placement.
	if (block) {
		const blockText = block.textContent ?? "";
		const hasTrailingBr = block.lastElementChild?.tagName === "BR";
		if (blockText.endsWith("\n") && !hasTrailingBr) {
			block.appendChild(document.createElement("br"));
		}
	}

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

	const childCount = root.children.length;
	const maxLineIdx = Math.max(0, childCount - 1);
	const lastChild = root.children[maxLineIdx] as HTMLElement | undefined;
	const lastLineLength = lastChild?.textContent?.replace(/\n$/, "").length ?? 0;

	if (line || cell) {
		const lineIdx =
			cell?.dataset.cellIndex !== undefined
				? Number(cell.dataset.cellIndex)
				: targetLineIdx;
		const documentWithCaret = document as Document & {
			caretRangeFromPoint?: (x: number, y: number) => Range | null;
		};
		const range = documentWithCaret.caretRangeFromPoint?.(
			event.clientX,
			event.clientY,
		);
		if (range && root.contains(range.startContainer)) {
			const block: HTMLElement | null =
				range.startContainer instanceof Element
					? range.startContainer.closest(".editor-line-row")
					: (range.startContainer.parentElement?.closest(".editor-line-row") ??
						null);
			if (block) {
				const local = document.createRange();
				local.selectNodeContents(block);
				local.setEnd(range.startContainer, range.startOffset);
				return {
					lineIdx: Number(block.dataset.editorLine ?? 1) - 1,
					col: local.toString().length,
				};
			}
		}
		const curChild = root.children[lineIdx] as HTMLElement | undefined;
		const curLen = curChild?.textContent?.replace(/\n$/, "").length ?? 0;
		return { lineIdx: Math.min(Math.max(0, lineIdx), maxLineIdx), col: curLen };
	}

	// Clicked in empty space below/outside lines -> place caret at the end of the file
	return {
		lineIdx: maxLineIdx,
		col: lastLineLength,
	};
}

function getSourceKey(
	lines: readonly string[],
	filePath?: string,
	title?: string,
): string {
	return `${JSON.stringify(lines)}:${filePath ?? ""}:${title ?? ""}`;
}

export function EditorSurfaceView({
	documentId,
	lines,
	draft,
	disabled = false,
	activeCellIndex,
	selectedCellRange: selectedCellRangeProp = null,
	vimEnabled = false,
	vimMode,
	searchWidget,
	filePath,
	title,
	onTextChange,
	onFocusChange,
	onCursorChange,
	onPointerTarget,
	onKeyDown,
	onExecuteLine,
	onExecuteRange,
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
		if (vimEnabled && vimMode !== "INSERT") return;
		const { lineIdx, col } = getActiveLineAndCol(root);
		const currentLine = lineIdx + 1;
		const currentColumn = col + 1;
		setActiveLineNumber(currentLine);
		onCursorChange?.(`${currentLine}:${currentColumn}`);
	};

	useEffect(() => {
		const root = rootRef.current;
		if (root) {
			(root as any).__syncLastRendered = (lines: readonly string[]) => {
				lastRenderedText.current = getSourceKey(lines, filePath, title);
			};
		}
	}, [filePath, title]);

	useEffect(() => {
		const root = rootRef.current;
		if (!root) return;
		const sourceKey = getSourceKey(sourceLines, filePath, title);
		if (lastRenderedText.current === sourceKey) return;
		const lang = detectLanguage(filePath, title);
		root.replaceChildren(
			...sourceLines.map((line, index) => {
				const block = document.createElement("div");
				block.className = "editor-line-row";
				block.dataset.editorLine = String(index + 1);
				if (line.length > 0) {
					if (lang && hljs.getLanguage(lang)) {
						try {
							const highlighted = hljs.highlight(line, {
								language: lang,
								ignoreIllegals: true,
							});
							block.innerHTML = highlighted.value;
						} catch {
							block.textContent = line;
						}
					} else {
						block.textContent = line;
					}
				} else {
					block.textContent = "";
				}
				if (line.length === 0 || line.endsWith("\n")) {
					const br = document.createElement("br");
					block.appendChild(br);
				}
				return block;
			}),
		);
		lastRenderedText.current = sourceKey;
		if (
			activeCellIndex !== undefined &&
			focusedRef.current &&
			vimMode !== "INSERT"
		) {
			setLineAndCol(root, activeCellIndex, 0);
		}
	}, [sourceLines, filePath, title, activeCellIndex, vimMode]);

	useEffect(() => {
		if (activeCellIndex !== undefined) {
			setActiveLineNumber(activeCellIndex + 1);
		}
	}, [activeCellIndex]);

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
				if (!vimOwnsCaret) {
					if (!authored.contains(event.target as Node)) {
						event.preventDefault();
					}
					authored.focus();
					setLineAndCol(authored, point.lineIdx, point.col);
					updateCursor();
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
				const authored = rootRef.current;
				if (
					pointerDownRef.current === event.pointerId &&
					vimEnabled &&
					vimMode === "INSERT"
				) {
					if (authored) {
						const point = pointerPosition(authored, event);
						onPointerTarget?.(point.lineIdx, point.col, false);
					}
				}
				if (!vimOwnsCaret && authored) {
					updateCursor();
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
						}}
						onBlur={() => {
							focusedRef.current = false;
							onFocusChange?.(false);
						}}
						onKeyDown={(event) => {
							const handled = onKeyDown?.(event) ?? false;
							if (handled) {
								event.preventDefault();
								updateCursor();
								return;
							}
						}}
						onInput={() => {
							const next = linesFromSurface(rootRef.current!);
							lastRenderedText.current = getSourceKey(next, filePath, title);
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
								vimEnabled &&
								vimMode !== "INSERT" &&
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
							const isPinned = lineDto?.macroResolution === "default";
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
															{resolveDiagnosticMessage(
																{
																	line: cellIdx + 1,
																	macroName: lineDto?.macroName,
																	...diagnostic,
																} as InspectorDiagnosticItem,
																t,
															)}
														</span>
													) : projectionText ? (
														<span className="cell-projection-preview">
															{projectionText}
														</span>
													) : null}
												</div>
												<div className="cell-output-actions">
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

	const syncLastRendered = (lines: readonly string[]) => {
		(element as any)?.__syncLastRendered?.(lines);
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

		insertCell: (position: InsertPosition, text = "") => {
			const { lineIdx } = getActiveLineAndCol(element);
			const lines = getFullLines();
			const insertIdx = position === "below" ? lineIdx + 1 : lineIdx;
			lines.splice(insertIdx, 0, text);
			onTextChange(lines);
			setLineAndCol(element, insertIdx, 0);
		},

		splitCellAtCaret: () => {
			const next = splitCellAtSelection(element);
			if (next) {
				syncLastRendered(next);
				onTextChange(next);
			}
		},

		insertTextAtCaret: (text: string) => {
			const next = insertTextAtSelection(element, text);
			if (next) {
				syncLastRendered(next);
				onTextChange(next);
			}
		},

		searchText: (
			query: string,
			direction: SearchDirection,
			navigate = false,
			searchOptions = { matchCase: false, wholeWord: false, regex: false },
		): EditorSearchResult => {
			if (!query) {
				clearSearchHighlights();
				return {
					documentId: options?.documentId ?? "",
					textRevision: options?.textRevision ?? 0,
					matches: [],
					activeMatchIndex: -1,
				};
			}
			const lines = getFullLines();
			const matches = lines.flatMap((text, logicalLineIndex) => {
				const result: {
					logicalLineIndex: number;
					startOffset: number;
					endOffset: number;
				}[] = [];
				const start = 0;
				let matcher: RegExp;
				try {
					matcher = searchOptions.regex
						? new RegExp(query, searchOptions.matchCase ? "gu" : "giu")
						: new RegExp(
								searchOptions.wholeWord
									? `(?<![\\p{L}\\p{N}_])${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}_])`
									: query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
								searchOptions.matchCase ? "gu" : "giu",
							);
				} catch {
					return result;
				}
				let match = matcher.exec(text);
				while (match) {
					const found = match.index;
					result.push({
						logicalLineIndex,
						startOffset: found,
						endOffset: found + match[0].length,
					});
					if (match[0].length === 0) matcher.lastIndex += 1;
					match = matcher.exec(text);
				}
				return result;
			});
			const previousSearch = lastSearch;
			lastSearch = query;
			if (
				document.activeElement === element ||
				element.contains(document.activeElement)
			)
				syncFromDom();
			const caretIndex = matches.findIndex((match) =>
				direction === "forward"
					? match.logicalLineIndex > currentCellIdx ||
						(match.logicalLineIndex === currentCellIdx &&
							match.startOffset >= currentCol)
					: match.logicalLineIndex < currentCellIdx ||
						(match.logicalLineIndex === currentCellIdx &&
							match.endOffset <= currentCol),
			);
			const previousMatch = lastMatch;
			const lastIndex = previousMatch
				? matches.findIndex(
						(match) =>
							match.logicalLineIndex === previousMatch.cell &&
							match.startOffset === previousMatch.start,
					)
				: -1;
			const selectedIndex =
				matches.length === 0
					? -1
					: navigate && previousSearch === query && lastIndex >= 0
						? (lastIndex +
								(direction === "forward" ? 1 : -1) +
								matches.length) %
							matches.length
						: caretIndex === -1
							? 0
							: caretIndex;
			const selected = selectedIndex >= 0 ? matches[selectedIndex] : undefined;
			if (selected) {
				lastMatch = {
					cell: selected.logicalLineIndex,
					start: selected.startOffset,
					end: selected.endOffset,
				};
				if (navigate) {
					currentCellIdx = selected.logicalLineIndex;
					currentCol = selected.startOffset;
					setSearchPosition(element, currentCellIdx, currentCol);
				}
			}
			applySearchHighlights(element, matches, selectedIndex);
			return {
				documentId: options?.documentId ?? "",
				textRevision: options?.textRevision ?? 0,
				matches,
				activeMatchIndex: selectedIndex,
			};
		},

		jumpToMatch: (
			logicalLineIndex: number,
			startOffset: number,
			length?: number,
		) => {
			currentCellIdx = logicalLineIndex;
			currentCol = startOffset;
			lastMatch = {
				cell: logicalLineIndex,
				start: startOffset,
				end: startOffset + (length ?? (lastSearch ? lastSearch.length : 0)),
			};
			setLineAndCol(element, logicalLineIndex, startOffset);
		},

		clearSearchHighlights: () => {
			clearSearchHighlights();
		},

		findText: (query: string, direction: SearchDirection, navigate = true) => {
			const needle = query;
			if (!needle) {
				clearSearchHighlights();
				return false;
			}
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
					if (navigate) {
						currentCellIdx = index;
						currentCol = start;
						setLineAndCol(element, index, start);
					}
					return true;
				}
			}
			return false;
		},

		repeatFind: (direction: SearchDirection) =>
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
								const highlightedMatches = lines.flatMap(
									(text, logicalLineIndex) => {
										const found: {
											logicalLineIndex: number;
											startOffset: number;
											endOffset: number;
										}[] = [];
										let offset = 0;
										while (offset <= text.length) {
											const match = text.indexOf(needle, offset);
											if (match < 0) break;
											found.push({
												logicalLineIndex,
												startOffset: match,
												endOffset: match + needle.length,
											});
											offset = match + Math.max(1, needle.length);
										}
										return found;
									},
								);
								applySearchHighlights(
									element,
									highlightedMatches,
									highlightedMatches.findIndex(
										(match) =>
											match.logicalLineIndex === index &&
											match.startOffset === start,
									),
								);
								return true;
							}
						}
						return false;
					})(),
			),

		replaceCurrentMatch: (
			query: string,
			replacement: string,
			targetLineIndex?: number,
			targetStartOffset?: number,
		) => {
			if (!query) return false;
			const lines = getFullLines();
			const cell =
				targetLineIndex !== undefined
					? targetLineIndex
					: lastMatch
						? lastMatch.cell
						: currentCellIdx;
			const text = lines[cell] ?? "";

			let start =
				targetStartOffset !== undefined
					? targetStartOffset
					: lastMatch
						? lastMatch.start
						: currentCol;
			let end =
				targetStartOffset !== undefined
					? targetStartOffset + query.length
					: lastMatch
						? lastMatch.end
						: start + query.length;

			if (text.slice(start, end) !== query) {
				const foundIdx = text.indexOf(query, start);
				if (foundIdx !== -1) {
					start = foundIdx;
					end = start + query.length;
				} else {
					const anyIdx = text.indexOf(query);
					if (anyIdx !== -1) {
						start = anyIdx;
						end = start + query.length;
					} else {
						return false;
					}
				}
			}

			lines[cell] = text.slice(0, start) + replacement + text.slice(end);
			const nextColumn = start + replacement.length;
			lastMatch = {
				cell,
				start,
				end: nextColumn,
			};
			currentCellIdx = cell;
			currentCol = nextColumn;
			onTextChange(lines);
			setSearchPosition(element, currentCellIdx, currentCol);
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

		pasteCell: (text: string, position: InsertPosition) => {
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

		// ─── Text-Level Operations (Generic text buffer variant) ────────────
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
		setSelection: ({ start, end }: { start: number; end: number }) => {
			const fullText = textFromSurface(element);
			const beforeStart = fullText.slice(0, start).split("\n");
			const startLineIdx = Math.max(0, beforeStart.length - 1);
			const startCol = beforeStart[startLineIdx]?.length ?? 0;

			if (start === end || end === undefined) {
				setLineAndCol(element, startLineIdx, startCol);
				return;
			}

			const beforeEnd = fullText.slice(0, end).split("\n");
			const endLineIdx = Math.max(0, beforeEnd.length - 1);
			const endCol = beforeEnd[endLineIdx]?.length ?? 0;

			const startBlock = element.children[startLineIdx] as
				| HTMLElement
				| undefined;
			const endBlock = element.children[endLineIdx] as HTMLElement | undefined;
			if (!startBlock || !endBlock) {
				setLineAndCol(element, startLineIdx, startCol);
				return;
			}

			try {
				const range = document.createRange();
				setLineAndCol(element, startLineIdx, startCol);
				const sel = window.getSelection();
				if (sel && sel.rangeCount > 0) {
					const r = sel.getRangeAt(0);
					range.setStart(r.startContainer, r.startOffset);
				}
				setLineAndCol(element, endLineIdx, endCol);
				const sel2 = window.getSelection();
				if (sel2 && sel2.rangeCount > 0) {
					const r2 = sel2.getRangeAt(0);
					range.setEnd(r2.endContainer, r2.endOffset);
				}
				const finalSel = window.getSelection();
				finalSel?.removeAllRanges();
				finalSel?.addRange(range);
			} catch {
				setLineAndCol(element, startLineIdx, startCol);
			}
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
		moveToLineBoundary: (boundary: "start" | "end" | "firstNonWhitespace") => {
			const { lineIdx } = getActiveLineAndCol(element);
			const lines = getFullLines();
			const line = lines[lineIdx] ?? "";
			let targetCol = 0;
			if (boundary === "end") {
				targetCol = line.length;
			} else if (boundary === "firstNonWhitespace") {
				const match = /\S/.exec(line);
				targetCol = match ? match.index : 0;
			}
			setLineAndCol(element, lineIdx, targetCol);
		},
		moveWord: (direction: -1 | 1) => {
			const { lineIdx, col } = getActiveLineAndCol(element);
			const lines = getFullLines();
			const line = lines[lineIdx] ?? "";
			const wordChar = /[\p{L}\p{N}_]/u;
			const whitespace = /\s/;

			if (direction === 1) {
				let i = col;
				const len = line.length;
				if (i >= len - 1) {
					if (lineIdx < lines.length - 1) {
						setLineAndCol(element, lineIdx + 1, 0);
					}
					return;
				}
				const isWord = wordChar.test(line[i] ?? "");
				if (isWord) {
					while (i < len && wordChar.test(line[i] ?? "")) i++;
				} else if (!whitespace.test(line[i] ?? "")) {
					while (
						i < len &&
						!wordChar.test(line[i] ?? "") &&
						!whitespace.test(line[i] ?? "")
					)
						i++;
				}
				while (i < len && whitespace.test(line[i] ?? "")) i++;
				setLineAndCol(element, lineIdx, Math.min(len, i));
			} else {
				if (col <= 0) {
					if (lineIdx > 0) {
						const prevLen = lines[lineIdx - 1]?.length ?? 0;
						setLineAndCol(element, lineIdx - 1, prevLen);
					}
					return;
				}
				let i = col - 1;
				while (i > 0 && whitespace.test(line[i] ?? "")) i--;
				const isWord = wordChar.test(line[i] ?? "");
				if (isWord) {
					while (i > 0 && wordChar.test(line[i - 1] ?? "")) i--;
				} else if (!whitespace.test(line[i] ?? "")) {
					while (
						i > 0 &&
						!wordChar.test(line[i - 1] ?? "") &&
						!whitespace.test(line[i - 1] ?? "")
					)
						i--;
				}
				setLineAndCol(element, lineIdx, Math.max(0, i));
			}
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
		deleteCharUnderCaret: () => {
			const { lineIdx, col } = getActiveLineAndCol(element);
			const lines = getFullLines();
			const line = lines[lineIdx] ?? "";
			if (col < line.length) {
				lines[lineIdx] = line.slice(0, col) + line.slice(col + 1);
				onTextChange(lines);
				setLineAndCol(element, lineIdx, col);
			} else if (lineIdx < lines.length - 1) {
				const nextLine = lines[lineIdx + 1] ?? "";
				lines.splice(lineIdx, 2, line + nextLine);
				onTextChange(lines);
				setLineAndCol(element, lineIdx, col);
			}
		},
		insertLine: (position: InsertPosition) => {
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
