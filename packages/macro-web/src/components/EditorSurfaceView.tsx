import type { ScratchpadLineDto } from "@stateful-mcp/macro-protocol";
import { AlertTriangle, Check, Circle, Pin, Play } from "lucide-react";
import { type RefObject, useEffect, useRef, useState } from "react";
import type {
	BrowserEditorSurfaceAdapter,
	BrowserVimKeyboardEvent,
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
	readonly onTextChange: (text: string) => void;
	readonly onFocusChange?: (focused: boolean) => void;
	readonly onCursorChange?: (cursor: string) => void;
	readonly onKeyDown?: (event: BrowserVimKeyboardEvent) => boolean;
	readonly onExecuteLine?: (lineNumber: number) => void;
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

function selectionFromSurface(root: HTMLElement): {
	start: number;
	end: number;
} {
	const selection = window.getSelection();
	if (!selection || selection.rangeCount === 0) return { start: 0, end: 0 };
	const range = selection.getRangeAt(0);
	if (!root.contains(range.startContainer)) return { start: 0, end: 0 };
	return {
		start: offsetAtPoint(root, range.startContainer, range.startOffset),
		end: offsetAtPoint(root, range.endContainer, range.endOffset),
	};
}

function setSurfaceSelection(
	root: HTMLElement,
	start: number,
	end: number,
): void {
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
	let position = 0;
	let startPoint: { node: Node; offset: number } | undefined;
	let endPoint: { node: Node; offset: number } | undefined;
	let current = walker.nextNode();
	while (current) {
		const length = current.textContent?.length ?? 0;
		if (!startPoint && start <= position + length)
			startPoint = { node: current, offset: Math.max(0, start - position) };
		if (!endPoint && end <= position + length) {
			endPoint = { node: current, offset: Math.max(0, end - position) };
			break;
		}
		position += length;
		current = walker.nextNode();
	}
	const fallback = root.lastChild ?? root;
	startPoint ??= { node: fallback, offset: fallback.textContent?.length ?? 0 };
	endPoint ??= startPoint;
	const range = document.createRange();
	range.setStart(startPoint.node, startPoint.offset);
	range.setEnd(endPoint.node, endPoint.offset);
	const selection = window.getSelection();
	selection?.removeAllRanges();
	selection?.addRange(range);
}

export function EditorSurfaceView({
	documentId,
	text,
	lines,
	draft,
	pinnedMacroIds = [],
	disabled = false,
	onTextChange,
	onFocusChange,
	onCursorChange,
	onKeyDown,
	onExecuteLine,
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

	const updateCursor = () => {
		const root = rootRef.current;
		if (!root) return;
		const selection = selectionFromSurface(root);
		const currentText = textFromSurface(root);
		const linesSlice = currentText.slice(0, selection.end).split("\n");
		const currentLine = linesSlice.length;
		const currentColumn = (linesSlice.at(-1)?.length ?? 0) + 1;
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
		<div className="editor-surface-view" data-document-id={documentId}>
			<div className="editor-canvas">
				{/* Lined Cells Container: Hybrid Jupyter/Editor per-cell companion layout */}
				<div className="editor-cells-wrapper">
					{/* Native Authored Text Surface (Overlaid / Synchronized) */}
					<div
						ref={(element) => {
							rootRef.current = element;
							if (surfaceRef) surfaceRef.current = element;
						}}
						className="editor-authored-input"
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
							const lineDto = lines.find((l) => l.lineNumber === lineNum);
							const isLineActive = activeLineNumber === lineNum;
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
									className={`editor-cell-unit ${isLineActive ? "active" : ""} ${lineDto?.lineStatus ?? "normal"} ${hasOutput ? "has-output" : ""}`}
									data-line-number={lineNum}
								>
									{/* Gutter cell aligned with the authored text line */}
									<div className="editor-cell-gutter">
										<span className="gutter-marker">
											{isLineActive ? "▎" : " "}
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
														<span className="cell-diagnostic-text">
															{diagnostic.message}
														</span>
													) : projectionText ? (
														<span className="cell-preview-text">
															{projectionText}
														</span>
													) : lineDto?.macroName ? (
														<span className="cell-macro-tag">
															{lineDto.macroName}
														</span>
													) : null}
												</div>

												{lineDto?.macroName && (
													<div className="cell-output-actions">
														<button
															type="button"
															className="cell-action-btn"
															title={t("editor.execution.line")}
															aria-label={t("editor.execution.line")}
															onClick={() => onExecuteLine?.(lineNum)}
														>
															<Play size={10} />
														</button>
														<button
															type="button"
															className={`cell-action-btn ${isPinned ? "pinned" : ""}`}
															title={
																isPinned
																	? t("editor.document.pinnedMacro")
																	: t("editor.document.pinMacro")
															}
															aria-label={
																isPinned
																	? t("editor.document.pinnedMacro")
																	: t("editor.document.pinMacro")
															}
															onClick={() =>
																onPinMacro?.(
																	isPinned ? null : (lineDto.macroName ?? null),
																)
															}
														>
															<Pin size={10} />
														</button>
													</div>
												)}
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
): BrowserEditorSurfaceAdapter | undefined {
	if (!element) return undefined;
	return {
		getText: () => textFromSurface(element),
		getSelection: () => selectionFromSurface(element),
		setSelection: ({ start, end }) => setSurfaceSelection(element, start, end),
		replaceSelection: (text) => {
			const current = textFromSurface(element);
			const selection = selectionFromSurface(element);
			const next = `${current.slice(0, selection.start)}${text}${current.slice(selection.end)}`;
			onTextChange(next);
		},
		moveLine: (delta: -1 | 1) => {
			const fullText = textFromSurface(element);
			const selection = selectionFromSurface(element);
			const beforeCaret = fullText.slice(0, selection.end);
			const lines = fullText.split("\n");
			const beforeLines = beforeCaret.split("\n");
			const currentLineIdx = beforeLines.length - 1;
			const currentCol = beforeLines[currentLineIdx]?.length ?? 0;
			const targetLineIdx = currentLineIdx + delta;

			if (targetLineIdx < 0 || targetLineIdx >= lines.length) return;

			let targetOffset = 0;
			for (let i = 0; i < targetLineIdx; i++) {
				targetOffset += (lines[i]?.length ?? 0) + 1;
			}
			const targetLineLen = lines[targetLineIdx]?.length ?? 0;
			const newOffset = targetOffset + Math.min(currentCol, targetLineLen);
			setSurfaceSelection(element, newOffset, newOffset);
		},
		moveToLineBoundary: (boundary: "start" | "end") => {
			const fullText = textFromSurface(element);
			const selection = selectionFromSurface(element);
			const prevNewline = fullText.lastIndexOf("\n", selection.end - 1);
			const nextNewline = fullText.indexOf("\n", selection.end);
			const startOffset = prevNewline === -1 ? 0 : prevNewline + 1;
			const endOffset = nextNewline === -1 ? fullText.length : nextNewline;
			const target = boundary === "start" ? startOffset : endOffset;
			setSurfaceSelection(element, target, target);
		},
		deleteCurrentLine: () => {
			const fullText = textFromSurface(element);
			const selection = selectionFromSurface(element);
			const prevNewline = fullText.lastIndexOf("\n", selection.end - 1);
			const nextNewline = fullText.indexOf("\n", selection.end);
			const startOffset = prevNewline === -1 ? 0 : prevNewline + 1;
			const endOffset = nextNewline === -1 ? fullText.length : nextNewline + 1;
			const nextText =
				fullText.slice(0, startOffset) + fullText.slice(endOffset);
			onTextChange(nextText);
			const newPos = Math.min(startOffset, nextText.length);
			setSurfaceSelection(element, newPos, newPos);
		},
		insertLine: (position: "above" | "below") => {
			const fullText = textFromSurface(element);
			const selection = selectionFromSurface(element);
			if (position === "below") {
				const nextNewline = fullText.indexOf("\n", selection.end);
				const endOffset = nextNewline === -1 ? fullText.length : nextNewline;
				const nextText = `${fullText.slice(0, endOffset)}\n${fullText.slice(endOffset)}`;
				onTextChange(nextText);
				const newPos = endOffset + 1;
				setSurfaceSelection(element, newPos, newPos);
			} else {
				const prevNewline = fullText.lastIndexOf("\n", selection.end - 1);
				const startOffset = prevNewline === -1 ? 0 : prevNewline + 1;
				const nextText = `${fullText.slice(0, startOffset)}\n${fullText.slice(startOffset)}`;
				onTextChange(nextText);
				setSurfaceSelection(element, startOffset, startOffset);
			}
		},
		focus: () => element.focus(),
	};
}
