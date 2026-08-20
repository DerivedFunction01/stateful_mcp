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
	const displayedLines: readonly ScratchpadLineDto[] = lines.length
		? lines
		: [{ lineNumber: 1, rawText: "", lineStatus: "empty", diagnostics: [] }];

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
					// Add a br or zero-width space for empty lines so the DOM block is selectable and has line-height
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
				{/* Lined Gutter Layer */}
				<div className="editor-gutter" aria-hidden="true">
					{displayedLines.map((line) => {
						const isLineActive = activeLineNumber === line.lineNumber;
						const hasError =
							line.lineStatus === "invalid" ||
							line.diagnostics.some((d) => d.severity === "error");
						const isPinned = Boolean(
							line.macroName && pinnedMacroIds.includes(line.macroName),
						);
						const isValid = line.lineStatus === "valid";

						return (
							<div
								className={`gutter-line-cell ${isLineActive ? "active" : ""} ${line.lineStatus}`}
								key={line.lineNumber}
							>
								<span className="gutter-marker">
									{isLineActive ? "▎" : " "}
								</span>
								<span
									className={`gutter-sign ${hasError ? "error" : isPinned ? "pinned" : line.lineStatus}`}
								>
									{hasError ? (
										<AlertTriangle size={12} />
									) : isPinned ? (
										<Pin size={12} />
									) : isValid ? (
										<Check size={12} />
									) : isLineActive ? (
										<Circle size={8} fill="currentColor" />
									) : null}
								</span>
								<span className="gutter-number">
									{String(line.lineNumber).padStart(
										Math.max(2, String(lines.length || 1).length),
										"0",
									)}
								</span>
								<span className="gutter-border">│</span>
							</div>
						);
					})}
				</div>

				{/* Authored + Companion Projections Layer */}
				<div className="editor-content-area">
					{/* Native Authored Text Surface */}
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

					{/* Projection & Companion Row Annotations */}
					<div className="editor-projection-stream" aria-live="polite">
						{displayedLines.map((line) => {
							const isLineActive = activeLineNumber === line.lineNumber;
							const diagnostic = line.diagnostics[0];
							const projectionText =
								line.preview?.text ?? line.executionPreview?.text;
							const isPinned = Boolean(
								line.macroName && pinnedMacroIds.includes(line.macroName),
							);
							const hasError =
								line.lineStatus === "invalid" || Boolean(diagnostic);

							if (
								line.lineStatus === "empty" &&
								!diagnostic &&
								!projectionText
							) {
								return null;
							}

							return (
								<div
									className={`projection-companion-row ${line.lineStatus} ${isLineActive ? "active" : ""}`}
									key={`proj:${line.lineNumber}`}
									data-line-number={line.lineNumber}
								>
									<span className="projection-anchor">↳</span>
									<span className="projection-message">
										{diagnostic ? (
											<span className="projection-diagnostic-text">
												{diagnostic.message}
											</span>
										) : projectionText ? (
											<span className="projection-preview-text">
												{projectionText}
											</span>
										) : (
											<span className="projection-status-label">
												{t(
													`editor.lineStatus.${line.lineStatus === "non-macro" ? "nonMacro" : line.lineStatus}`,
												)}
											</span>
										)}
									</span>
									<div className="projection-actions">
										{line.macroName && (
											<>
												<button
													type="button"
													className="line-action-btn"
													title={t("editor.execution.line")}
													aria-label={t("editor.execution.line")}
													onClick={() => onExecuteLine?.(line.lineNumber)}
												>
													<Play size={11} />
												</button>
												<button
													type="button"
													className={`line-action-btn ${isPinned ? "pinned" : ""}`}
													title={
														isPinned
															? t("editor.document.pinnedMacro")
															: t("editor.document.pinMacro")
													}
													onClick={() =>
														onPinMacro?.(
															isPinned ? null : (line.macroName ?? null),
														)
													}
												>
													<Pin size={11} />
												</button>
											</>
										)}
									</div>
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
		focus: () => element.focus(),
	};
}
