import type {
	ScratchpadLineDto,
	ScratchpadLineStatus,
} from "@stateful-mcp/macro-protocol";
import { AlertTriangle, Circle, Pin, Play } from "lucide-react";
import { type RefObject, useEffect, useRef } from "react";
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

function lineForStatus(status: ScratchpadLineStatus): string {
	return status === "non-macro" ? "nonMacro" : status;
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
	const sourceText = draft ?? text;
	const displayedLines: readonly ScratchpadLineDto[] = lines.length
		? lines
		: [{ lineNumber: 1, rawText: "", lineStatus: "empty", diagnostics: [] }];

	const updateCursor = () => {
		const root = rootRef.current;
		if (!root) return;
		const selection = selectionFromSurface(root);
		const currentText = textFromSurface(root);
		const lineAt = (offset: number) =>
			currentText.slice(0, offset).split("\n").length;
		const columnAt = (offset: number) => {
			const line = currentText.slice(0, offset).split("\n");
			return (line.at(-1)?.length ?? 0) + 1;
		};
		onCursorChange?.(`${lineAt(selection.end)}:${columnAt(selection.end)}`);
	};

	useEffect(() => {
		const root = rootRef.current;
		if (!root || focusedRef.current) return;
		if (lastRenderedText.current === sourceText) return;
		root.replaceChildren(
			...sourceText.split("\n").map((line, index) => {
				const block = document.createElement("div");
				block.dataset.editorLine = String(index + 1);
				block.textContent = line;
				return block;
			}),
		);
		lastRenderedText.current = sourceText;
	}, [sourceText]);

	return (
		<div className="editor-surface-view" data-document-id={documentId}>
			<div className="editor-surface-toolbar">
				<span className="surface-kicker">{t("editor.surface.authored")}</span>
				<span className="editor-surface-hint">
					{t("editor.surface.nativeEditing")}
				</span>
			</div>
			<div className="editor-canvas">
				<div className="editor-lines" aria-hidden="true">
					{displayedLines.map((line) => {
						const hasError =
							line.lineStatus === "invalid" ||
							line.diagnostics.some(
								(diagnostic) => diagnostic.severity === "error",
							);
						const pinned = Boolean(
							line.macroName && pinnedMacroIds.includes(line.macroName),
						);
						return (
							<div
								className={`editor-line-gutter-row ${line.lineStatus}`}
								key={line.lineNumber}
							>
								<span
									className={`editor-line-marker ${hasError ? "error" : pinned ? "pinned" : line.lineStatus}`}
								>
									{hasError ? (
										<AlertTriangle size={13} />
									) : pinned ? (
										<Pin size={12} />
									) : line.lineStatus === "valid" ? (
										<Circle size={9} fill="currentColor" />
									) : null}
								</span>
								<span className="editor-line-number">
									{String(line.lineNumber).padStart(
										Math.max(2, String(lines.length || 1).length),
										"0",
									)}
								</span>
							</div>
						);
					})}
				</div>
				<div className="editor-authored-column">
					<div
						ref={(element) => {
							rootRef.current = element;
							if (surfaceRef) surfaceRef.current = element;
						}}
						className="editor-authored-input"
						contentEditable={disabled ? false : "plaintext-only"}
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
					<div className="editor-projection-layer">
						{displayedLines.map((line) => {
							const diagnostic = line.diagnostics[0];
							const projection = line.projections?.find(
								(item) => item.payload.availability === "available",
							);
							const projectionText =
								line.preview?.text ?? line.executionPreview?.text;
							return (
								<div
									className={`editor-projection-row ${line.lineStatus}`}
									key={line.lineNumber}
								>
									<span className="projection-prefix">↳</span>
									<span>
										{diagnostic
											? diagnostic.message
											: (projectionText ??
												(projection
													? t("editor.surface.projectionAvailable")
													: t("editor.surface.noProjection")))}
									</span>
									{line.macroName && (
										<button
											type="button"
											className="editor-line-action"
											aria-label={t("editor.execution.line")}
											onClick={() => onExecuteLine?.(line.lineNumber)}
										>
											<Play size={11} />
										</button>
									)}
								</div>
							);
						})}
					</div>
				</div>
			</div>
			<div className="editor-line-status-list">
				{displayedLines.map((line) => (
					<div
						className={`editor-line-status ${line.lineStatus}`}
						key={line.lineNumber}
					>
						<span>
							{t(`editor.lineStatus.${lineForStatus(line.lineStatus)}`)}
						</span>
						{line.macroName && (
							<button
								type="button"
								onClick={() =>
									onPinMacro?.(
										pinnedMacroIds.includes(line.macroName!)
											? null
											: line.macroName!,
									)
								}
							>
								{pinnedMacroIds.includes(line.macroName)
									? t("editor.document.pinnedMacro")
									: t("editor.document.pinMacro")}
							</button>
						)}
					</div>
				))}
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
