import type {
	EditorMode,
	EffectiveKeymapDto,
	InsertPosition,
	KeymapBindingDto,
	SearchDirection,
} from "@stateful-mcp/macro-protocol";

export interface BrowserVimKeyboardEvent {
	readonly key: string;
	readonly ctrlKey?: boolean;
	readonly metaKey?: boolean;
	readonly shiftKey?: boolean;
	readonly altKey?: boolean;
	preventDefault(): void;
	stopPropagation(): void;
}

export interface CellRange {
	readonly start: number;
	readonly end: number;
}

export interface EditorSearchMatch {
	readonly logicalLineIndex: number;
	readonly startOffset: number;
	readonly endOffset: number;
}

export interface EditorSearchResult {
	readonly documentId: string;
	readonly textRevision: number;
	readonly matches: readonly EditorSearchMatch[];
	readonly activeMatchIndex: number;
}

export interface BrowserEditorSurfaceAdapter {
	// Cell-aware operations (Scratchpad variant)
	getActiveCellIndex?(): number;
	setActiveCellIndex?(index: number): void;
	getCellCount?(): number;
	setCellCaret?(index: number, column: number): void;
	getSelectedCellRange?(): CellRange | null;
	setSelectedCellRange?(range: CellRange | null): void;
	moveCell?(delta: -1 | 1): void;
	extendCellSelection?(delta: -1 | 1): void;
	swapSelectionAnchor?(): void;
	executeCell?(index?: number): void;
	executeCellRange?(start: number, end: number): void;
	deleteCell?(index?: number): string; // returns deleted text for yank
	deleteCellRange?(start: number, end: number): string; // returns deleted text for yank
	yankCell?(index?: number): string;
	yankCellRange?(start: number, end: number): string;
	insertCell?(position: InsertPosition, text?: string): void;
	splitCellAtCaret?(): void;
	insertTextAtCaret?(text: string): void;
	findText?(
		query: string,
		direction: SearchDirection,
		navigate?: boolean,
		options?: { matchCase: boolean; wholeWord: boolean; regex: boolean },
	): boolean;
	searchText?(
		query: string,
		direction: SearchDirection,
		navigate?: boolean,
		options?: { matchCase: boolean; wholeWord: boolean; regex: boolean },
	): EditorSearchResult;
	jumpToMatch?(
		logicalLineIndex: number,
		startOffset: number,
		length?: number,
	): void;
	clearSearchHighlights?(): void;
	repeatFind?(direction: SearchDirection): boolean;
	replaceCurrentMatch?(
		query: string,
		replacement: string,
		lineIndex?: number,
		startOffset?: number,
		options?: { matchCase: boolean; wholeWord: boolean; regex: boolean },
	): boolean;
	replaceAllMatches?(
		query: string,
		replacement: string,
		options?: { matchCase: boolean; wholeWord: boolean; regex: boolean },
	): number;
	pasteCell?(text: string, position: InsertPosition): void;
	pasteCellRangeReplace?(start: number, end: number, text: string): void;
	focusCellForEdit?(index?: number, column?: number): void;
	blurCellEdit?(): void;

	// Underlying text operations (Generic text buffer variant)
	getText(): string;
	getCellText?(index: number): string;
	getSelection(): { start: number; end: number };
	setSelection(selection: { start: number; end: number }): void;
	replaceSelection(text: string): void;
	focus(): void;
	moveLine?(delta: -1 | 1): void;
	moveToLineBoundary?(boundary: "start" | "end" | "firstNonWhitespace"): void;
	moveWord?(direction: -1 | 1): void;
	deleteCurrentLine?(): void;
	insertLine?(position: InsertPosition): void;
	deleteCharUnderCaret?(): void;
	undo?(): void;
	redo?(): void;
}

export interface BrowserVimState {
	readonly enabled: boolean;
	readonly mode: EditorMode;
	readonly activeCellIndex: number;
	readonly caretColumn: number;
	readonly visualRange: CellRange | null;
	readonly selection?: { readonly start: number; readonly end: number } | null;
	readonly commandText: string;
}

export interface BrowserVimController {
	getState(): BrowserVimState;
	setEnabled(enabled: boolean): void;
	setActiveCell(index: number, count: number, column?: number): void;
	setPointerTarget(
		index: number,
		count: number,
		column: number,
		dragging?: boolean,
	): void;
	exitCommandMode(): void;
	handleKeyDown(event: BrowserVimKeyboardEvent): boolean;
	subscribe(listener: () => void): () => void;
}

export type KeyChordValueShape = string | readonly string[];

export interface EditorKeymapProfileShape {
	readonly vim?: {
		readonly normal?: Readonly<Record<string, KeyChordValueShape>>;
		readonly visual?: Readonly<Record<string, KeyChordValueShape>>;
		readonly sequences?: Readonly<Record<string, KeyChordValueShape>>;
	};
	readonly workbench?: Readonly<Record<string, KeyChordValueShape>>;
	readonly normal?: Readonly<Record<string, KeyChordValueShape>>;
	readonly visual?: Readonly<Record<string, KeyChordValueShape>>;
	readonly sequences?: Readonly<Record<string, KeyChordValueShape>>;
	readonly window?: Readonly<Record<string, KeyChordValueShape>>;
	readonly bindings?: readonly KeymapBindingDto[];
}

export type KeymapSource =
	| EffectiveKeymapDto
	| EditorKeymapProfileShape
	| undefined;

export type VimVariant = "scratchpad" | "generic";

export interface BrowserVimControllerOptions {
	readonly variant?: VimVariant | (() => VimVariant);
	readonly onCommandModeUnsupported?: () => void;
	readonly onOpenCommandMode?: (
		initialQuery?: string,
		commandMode?: boolean,
		commandToken?: string,
	) => void;
	readonly onOpenSearch?: (
		direction: SearchDirection,
		vimSearch?: boolean,
	) => void;
	readonly getAdapter?: () => BrowserEditorSurfaceAdapter | undefined;
	readonly getKeymap?: () => KeymapSource;
	readonly onExecuteLine?: (lineNumber?: number) => void;
	readonly onExecuteRange?: (startLine: number, endLine: number) => void;
	readonly onExecuteValidLines?: () => void;
	readonly onPreviewLine?: () => void;
}

export interface BrowserVimGroupController extends BrowserVimController {
	readonly groupId: string;
	getActiveDocumentId(): string | null;
	activateDocument(documentId: string | null): void;
	resetView(reason?: string): void;
}

export interface BrowserVimGroupManagerOptions {
	readonly getKeymap?: () => KeymapSource;
	readonly getVariant?: (
		groupId: string,
		documentId?: string | null,
	) => VimVariant;
	readonly getAdapter?: (
		groupId: string,
		documentId?: string | null,
	) => BrowserEditorSurfaceAdapter | undefined;
	readonly onOpenCommandMode?: (
		groupId: string,
		initialQuery?: string,
		commandMode?: boolean,
		commandToken?: string,
	) => void;
	readonly onOpenSearch?: (
		groupId: string,
		direction: SearchDirection,
		vimSearch?: boolean,
	) => void;
	readonly onExecuteLine?: (
		groupId: string,
		documentId: string | undefined,
		lineNumber?: number,
	) => void;
	readonly onExecuteRange?: (
		groupId: string,
		documentId: string | undefined,
		startLine: number,
		endLine: number,
	) => void;
	readonly onExecuteValidLines?: (
		groupId: string,
		documentId: string | undefined,
	) => void;
	readonly onPreviewLine?: (
		groupId: string,
		documentId: string | undefined,
	) => void;
}

export interface BrowserVimGroupManager {
	getGroupController(groupId: string): BrowserVimGroupController;
	getState(groupId?: string): BrowserVimState;
	setEnabled(enabled: boolean): void;
	initGroup(
		groupId: string,
		documentId?: string | null,
	): BrowserVimGroupController;
	removeGroup(groupId: string): void;
	activateDocument(groupId: string, documentId: string | null): void;
	resetGroup(groupId: string, reason?: string): void;
	exitCommandMode(groupId?: string): void;
	handleKeyDown(groupId: string, event: BrowserVimKeyboardEvent): boolean;
	subscribe(listener: () => void, groupId?: string): () => void;
	listGroups(): readonly string[];
}
