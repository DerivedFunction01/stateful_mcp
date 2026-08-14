import type {
	AcceptedMacroLock,
	MacroDraftDiagnostic,
	MacroDraftSession,
} from "@stateful-mcp/macro";

export interface ScratchpadTab {
	tabId: string;
	title: string;
	text: string;
	cursorOffset: number;
	locks: AcceptedMacroLock[];
	revision: number;
}

export interface HeadlessNotebookSnapshot {
	tabs: ScratchpadTab[];
	activeTabId: string;
	diagnostics: MacroDraftDiagnostic[];
}

export interface HeadlessNotebookState {
	version: 1;
	sessionId: string;
	tabs: ScratchpadTab[];
	activeTabId: string;
	undo: HeadlessNotebookSnapshot[];
	redo: HeadlessNotebookSnapshot[];
	diagnostics: MacroDraftDiagnostic[];
}

export type HeadlessNotebookAction =
	| { type: "tab.create"; tabId?: string; title?: string; text?: string }
	| { type: "tab.close"; tabId?: string }
	| { type: "tab.select"; tabId: string }
	| { type: "tab.rename"; tabId?: string; title: string }
	| { type: "edit.set"; text: string; cursorOffset?: number; tabId?: string }
	| { type: "edit.insert"; text: string; tabId?: string }
	| { type: "edit.delete"; count: number; tabId?: string }
	| { type: "edit.backspace"; count: number; tabId?: string }
	| { type: "cursor.set"; offset: number; tabId?: string }
	| { type: "cursor.move"; delta: number; tabId?: string }
	| { type: "cursor.home"; tabId?: string }
	| { type: "cursor.end"; tabId?: string }
	| { type: "lock.set"; locks: AcceptedMacroLock[]; tabId?: string }
	| { type: "lock.clear"; tabId?: string }
	| { type: "undo" }
	| { type: "redo" };

export function createHeadlessNotebookState(
	options: {
		sessionId?: string;
		initialText?: string;
		initialTitle?: string;
		initialTabId?: string;
	} = {},
): HeadlessNotebookState {
	const tab: ScratchpadTab = {
		tabId: options.initialTabId ?? "tab-1",
		title: options.initialTitle ?? "Scratchpad",
		text: options.initialText ?? "",
		cursorOffset: (options.initialText ?? "").length,
		locks: [],
		revision: 0,
	};
	return {
		version: 1,
		sessionId: options.sessionId ?? "headless-session",
		tabs: [tab],
		activeTabId: tab.tabId,
		undo: [],
		redo: [],
		diagnostics: [],
	};
}

export function reduceHeadlessNotebook(
	state: HeadlessNotebookState,
	action: HeadlessNotebookAction,
	options: { maxUndo?: number } = {},
): HeadlessNotebookState {
	if (action.type === "undo")
		return restoreSnapshot(state, state.undo.at(-1), "undo");
	if (action.type === "redo")
		return restoreSnapshot(state, state.redo.at(-1), "redo");
	const before = toSnapshot(state);
	const next = structuredClone(state);
	const tabId =
		"tabId" in action ? (action.tabId ?? state.activeTabId) : state.activeTabId;
	const tab = next.tabs.find((item) => item.tabId === tabId);
	if (!tab && !["tab.create"].includes(action.type))
		return withDiagnostic(
			state,
			"TAB_NOT_FOUND",
			`Tab '${tabId}' was not found`,
		);

	switch (action.type) {
		case "tab.create": {
			const id = action.tabId ?? nextTabId(next.tabs);
			if (next.tabs.some((item) => item.tabId === id))
				return withDiagnostic(
					state,
					"TAB_CONFLICT",
					`Tab '${id}' already exists`,
				);
			const text = action.text ?? "";
			next.tabs.push({
				tabId: id,
				title: action.title ?? id,
				text,
				cursorOffset: text.length,
				locks: [],
				revision: 0,
			});
			next.activeTabId = id;
			break;
		}
		case "tab.close": {
			if (next.tabs.length === 1)
				return withDiagnostic(
					state,
					"TAB_CONFLICT",
					"The last tab cannot be closed",
				);
			next.tabs = next.tabs.filter((item) => item.tabId !== tabId);
			if (next.activeTabId === tabId) next.activeTabId = next.tabs[0]!.tabId;
			break;
		}
		case "tab.select":
			next.activeTabId = action.tabId;
			break;
		case "tab.rename":
			tab!.title = action.title;
			break;
		case "edit.set":
			tab!.text = action.text;
			tab!.cursorOffset = clamp(
				action.cursorOffset ?? action.text.length,
				0,
				action.text.length,
			);
			tab!.locks = [];
			tab!.revision += 1;
			break;
		case "edit.insert":
			editTab(tab!, tab!.cursorOffset, tab!.cursorOffset, action.text);
			break;
		case "edit.delete":
			editTab(
				tab!,
				tab!.cursorOffset,
				tab!.cursorOffset + Math.max(0, action.count),
				"",
			);
			break;
		case "edit.backspace": {
			const start = Math.max(0, tab!.cursorOffset - Math.max(0, action.count));
			editTab(tab!, start, tab!.cursorOffset, "");
			break;
		}
		case "cursor.set":
			tab!.cursorOffset = clamp(action.offset, 0, tab!.text.length);
			break;
		case "cursor.move":
			tab!.cursorOffset = clamp(
				tab!.cursorOffset + action.delta,
				0,
				tab!.text.length,
			);
			break;
		case "cursor.home":
			tab!.cursorOffset = 0;
			break;
		case "cursor.end":
			tab!.cursorOffset = tab!.text.length;
			break;
		case "lock.set":
			tab!.locks = structuredClone(action.locks);
			break;
		case "lock.clear":
			tab!.locks = [];
			break;
	}
	if (JSON.stringify(before) === JSON.stringify(toSnapshot(next))) return next;
	next.undo = [...state.undo, before].slice(-(options.maxUndo ?? 100));
	next.redo = [];
	return next;
}

export class HeadlessNotebookModel {
	private sessions = new Map<string, MacroDraftSession>();

	constructor(
		public state: HeadlessNotebookState = createHeadlessNotebookState(),
	) {}

	dispatch(action: HeadlessNotebookAction): HeadlessNotebookState {
		const previous = this.state;
		this.state = reduceHeadlessNotebook(this.state, action);
		this.syncSession(action, previous);
		return this.state;
	}

	bindDraftSession(tabId: string, session: MacroDraftSession): void {
		this.sessions.set(tabId, session);
		const tab = this.state.tabs.find((item) => item.tabId === tabId);
		if (tab) session.setText(tab.text, tab.cursorOffset);
	}

	draftSession(tabId = this.state.activeTabId): MacroDraftSession | undefined {
		return this.sessions.get(tabId);
	}

	invalidateDraftBindings(): void {
		this.sessions.clear();
		this.state = {
			...this.state,
			tabs: this.state.tabs.map((tab) => ({ ...tab, locks: [] })),
		};
	}

	restore(state: HeadlessNotebookState): void {
		this.state = structuredClone(state);
		this.sessions.clear();
	}

	private syncSession(
		action: HeadlessNotebookAction,
		previous: HeadlessNotebookState,
	): void {
		const tabId =
			"tabId" in action
				? (action.tabId ?? this.state.activeTabId)
				: this.state.activeTabId;
		const session = this.sessions.get(tabId);
		const tab = this.state.tabs.find((item) => item.tabId === tabId);
		const oldTab = previous.tabs.find((item) => item.tabId === tabId);
		if (!session || !tab) return;
		if (action.type === "edit.set") session.setText(tab.text, tab.cursorOffset);
		else if (oldTab && action.type === "edit.insert")
			session.applyEdit({
				start: oldTab.cursorOffset,
				end: oldTab.cursorOffset,
				text: action.text,
			});
		else if (oldTab && action.type === "edit.delete")
			session.applyEdit({
				start: oldTab.cursorOffset,
				end: oldTab.cursorOffset + Math.max(0, action.count),
				text: "",
			});
		else if (oldTab && action.type === "edit.backspace")
			session.applyEdit({
				start: Math.max(0, oldTab.cursorOffset - Math.max(0, action.count)),
				end: oldTab.cursorOffset,
				text: "",
			});
		else return;
		const snapshot = session.snapshot();
		tab.locks = [...snapshot.locks];
	}
}

export function serializeHeadlessNotebook(
	state: HeadlessNotebookState,
): string {
	return JSON.stringify({ ...state, undo: state.undo, redo: state.redo });
}

export function restoreHeadlessNotebook(raw: string): HeadlessNotebookState {
	const parsed = JSON.parse(raw) as HeadlessNotebookState;
	if (parsed.version !== 1 || !Array.isArray(parsed.tabs))
		throw new Error("Unsupported headless notebook state");
	return structuredClone(parsed);
}

function restoreSnapshot(
	state: HeadlessNotebookState,
	snapshot: HeadlessNotebookSnapshot | undefined,
	direction: "undo" | "redo",
): HeadlessNotebookState {
	if (!snapshot) return state;
	const current = toSnapshot(state);
	return {
		...structuredClone(state),
		tabs: structuredClone(snapshot.tabs),
		activeTabId: snapshot.activeTabId,
		diagnostics: structuredClone(snapshot.diagnostics),
		undo:
			direction === "undo" ? state.undo.slice(0, -1) : [...state.undo, current],
		redo:
			direction === "undo" ? [...state.redo, current] : state.redo.slice(0, -1),
	};
}

function toSnapshot(state: HeadlessNotebookState): HeadlessNotebookSnapshot {
	return {
		tabs: structuredClone(state.tabs),
		activeTabId: state.activeTabId,
		diagnostics: structuredClone(state.diagnostics),
	};
}

function editTab(
	tab: ScratchpadTab,
	start: number,
	end: number,
	text: string,
): void {
	const safeStart = clamp(start, 0, tab.text.length);
	const safeEnd = clamp(end, safeStart, tab.text.length);
	tab.text = tab.text.slice(0, safeStart) + text + tab.text.slice(safeEnd);
	tab.cursorOffset = safeStart + text.length;
	tab.locks = [];
	tab.revision += 1;
}

function nextTabId(tabs: readonly ScratchpadTab[]): string {
	let index = tabs.length + 1;
	while (tabs.some((tab) => tab.tabId === `tab-${index}`)) index += 1;
	return `tab-${index}`;
}

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

function withDiagnostic(
	state: HeadlessNotebookState,
	code: string,
	message: string,
): HeadlessNotebookState {
	return {
		...structuredClone(state),
		diagnostics: [...state.diagnostics, { code, message }],
	};
}
