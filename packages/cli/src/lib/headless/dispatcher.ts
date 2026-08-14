import type { HistoryStore } from "@stateful-mcp/core";
import { MemoryHistoryStore } from "@stateful-mcp/core";
import {
	type MacroDraftSession,
	type MacroExecutionAttempt,
	MacroExecutionHistory,
	type MacroListenerRegistry,
	type MacroRendererRegistry,
	MacroReplayService,
} from "@stateful-mcp/macro";
import { failure, success } from "../output";
import type { HeadlessRequest, HeadlessResponse } from "./command-contracts";
import { reloadHeadlessExtensions } from "./extension-reload";
import {
	createHeadlessNotebookState,
	HeadlessNotebookModel,
	type HeadlessNotebookState,
} from "./notebook-state";
import { searchHeadless } from "./search";

export interface HeadlessDispatcherOptions {
	state?: HeadlessNotebookState;
	history?: HistoryStore<MacroExecutionAttempt>;
	macroHistory?: MacroExecutionHistory;
	listeners?: MacroListenerRegistry;
	renderers?: MacroRendererRegistry;
	draftSessions?: Map<string, MacroDraftSession>;
	streamId?: string;
}

export class HeadlessDispatcher {
	readonly notebook: HeadlessNotebookModel;
	readonly history: HistoryStore<MacroExecutionAttempt>;
	readonly macroHistory: MacroExecutionHistory;
	private readonly draftSessions: Map<string, MacroDraftSession>;

	constructor(options: HeadlessDispatcherOptions = {}) {
		this.notebook = new HeadlessNotebookModel(
			options.state ?? createHeadlessNotebookState(),
		);
		this.history =
			options.history ?? new MemoryHistoryStore<MacroExecutionAttempt>();
		this.macroHistory =
			options.macroHistory ??
			new MacroExecutionHistory(this.history, {
				streamId: options.streamId,
				listeners: options.listeners,
				renderers: options.renderers,
			});
		this.draftSessions = options.draftSessions ?? new Map();
		for (const [tabId, session] of this.draftSessions)
			this.notebook.bindDraftSession(tabId, session);
	}

	async dispatch(request: HeadlessRequest): Promise<HeadlessResponse<unknown>> {
		const command = request.command;
		const parts = command.trim().split(/\s+/u).filter(Boolean);
		const root = parts[0] ?? "";
		try {
			if (root === "state") return success(command, this.notebook.state);
			if (root === "tab")
				return this.tab(command, parts.slice(1), request.options ?? {});
			if (root === "edit")
				return this.edit(command, parts.slice(1), request.options ?? {});
			if (root === "undo" || root === "redo") {
				this.notebook.dispatch({ type: root });
				return success(command, this.notebook.state);
			}
			if (root === "preview")
				return this.preview(command, request.options ?? {});
			if (root === "execute")
				return await this.execute(command, request.options ?? {});
			if (root === "history")
				return await this.historyCommand(
					command,
					parts.slice(1),
					request.options ?? {},
				);
			if (root === "search")
				return await this.search(command, request.options ?? {});
			if (root === "extensions")
				return await this.extensions(
					command,
					parts.slice(1),
					request.options ?? {},
				);
			return failure(
				command,
				"USAGE_ERROR",
				`Unknown headless command '${command}'`,
			);
		} catch (error) {
			return failure(
				command,
				"INTERNAL_ERROR",
				error instanceof Error ? error.message : String(error),
			);
		}
	}

	private tab(
		command: string,
		parts: string[],
		options: Record<string, unknown>,
	): HeadlessResponse<unknown> {
		const action = parts[0];
		if (action === "list") return success(command, this.notebook.state.tabs);
		const diagnosticStart = this.notebook.state.diagnostics.length;
		if (action === "create") {
			this.notebook.dispatch({
				type: "tab.create",
				tabId: stringOption(options, "id"),
				title: stringOption(options, "title"),
				text: stringOption(options, "text"),
			});
			return this.actionResponse(command, this.activeTab(), diagnosticStart);
		}
		const tabId = stringOption(options, "tab") ?? parts[1];
		if (!tabId) return failure(command, "USAGE_ERROR", "A tab ID is required");
		if (action === "select")
			this.notebook.dispatch({ type: "tab.select", tabId });
		else if (action === "rename")
			this.notebook.dispatch({
				type: "tab.rename",
				tabId,
				title: stringOption(options, "title") ?? parts[2] ?? "",
			});
		else if (action === "close")
			this.notebook.dispatch({ type: "tab.close", tabId });
		else
			return failure(
				command,
				"USAGE_ERROR",
				`Unknown tab command '${action ?? ""}'`,
			);
		return this.actionResponse(command, this.activeTab(), diagnosticStart);
	}

	private edit(
		command: string,
		parts: string[],
		options: Record<string, unknown>,
	): HeadlessResponse<unknown> {
		const action = parts[0];
		const tabId = stringOption(options, "tab");
		const diagnosticStart = this.notebook.state.diagnostics.length;
		if (action === "set")
			this.notebook.dispatch({
				type: "edit.set",
				tabId,
				text: stringOption(options, "text") ?? parts.slice(1).join(" "),
				cursorOffset: numberOption(options, "cursor"),
			});
		else if (action === "insert")
			this.notebook.dispatch({
				type: "edit.insert",
				tabId,
				text: stringOption(options, "text") ?? parts.slice(1).join(" "),
			});
		else if (action === "delete" || action === "backspace")
			this.notebook.dispatch({
				type: `edit.${action}`,
				tabId,
				count: numberOption(options, "count") ?? Number(parts[1] ?? 1),
			} as never);
		else if (action === "cursor") {
			const kind = parts[1] ?? stringOption(options, "action") ?? "set";
			if (kind === "home" || kind === "end")
				this.notebook.dispatch({ type: `cursor.${kind}`, tabId } as never);
			else if (kind === "move")
				this.notebook.dispatch({
					type: "cursor.move",
					tabId,
					delta: numberOption(options, "delta") ?? Number(parts[2] ?? 0),
				});
			else
				this.notebook.dispatch({
					type: "cursor.set",
					tabId,
					offset: numberOption(options, "offset") ?? Number(parts[2] ?? 0),
				});
		} else
			return failure(
				command,
				"USAGE_ERROR",
				`Unknown edit command '${action ?? ""}'`,
			);
		return this.actionResponse(command, this.activeTab(), diagnosticStart);
	}

	private preview(
		command: string,
		options: Record<string, unknown>,
	): HeadlessResponse<unknown> {
		const tab = this.getTab(stringOption(options, "tab"));
		const session =
			this.draftSessions.get(tab.tabId) ??
			this.notebook.draftSession(tab.tabId);
		if (!session)
			return success(command, {
				tab,
				snapshot: undefined,
				historySequence: undefined,
			});
		return success(command, {
			tab,
			snapshot: this.macroHistory.preview(session),
			historySequence: undefined,
		});
	}

	private async execute(
		command: string,
		options: Record<string, unknown>,
	): Promise<HeadlessResponse<unknown>> {
		const tab = this.getTab(stringOption(options, "tab"));
		const session =
			this.draftSessions.get(tab.tabId) ??
			this.notebook.draftSession(tab.tabId);
		if (!session)
			return failure(
				command,
				"VALIDATION_ERROR",
				`Tab '${tab.tabId}' has no resolved macro inputs`,
			);
		const attemptId =
			stringOption(options, "attempt") ??
			`${this.notebook.state.sessionId}:${tab.tabId}:${tab.revision}`;
		const result = await this.macroHistory.execute({
			attemptId,
			session,
			authoredText: tab.text,
		});
		this.notebook.dispatch({
			type: "lock.set",
			tabId: tab.tabId,
			locks: result.attempt.locks,
		});
		return success(
			command,
			result,
			result.diagnostics.map((item) => ({
				code: item.code,
				message: item.message,
			})),
		);
	}

	private async historyCommand(
		command: string,
		parts: string[],
		options: Record<string, unknown>,
	): Promise<HeadlessResponse<unknown>> {
		const action = parts[0] ?? "list";
		if (action === "list")
			return success(
				command,
				await this.macroHistory.list({
					afterSequence: numberOption(options, "after"),
					limit: numberOption(options, "limit"),
				}),
			);
		if (action === "show") {
			const id = stringOption(options, "id") ?? parts[1];
			if (!id)
				return failure(command, "USAGE_ERROR", "An attempt ID is required");
			return success(command, await this.macroHistory.show(id));
		}
		if (action === "replay") {
			const replay = new MacroReplayService(
				this.history,
				this.macroHistory.listeners,
				this.macroHistory.renderers,
				this.macroHistory.streamId,
			);
			return success(
				command,
				await replay.replay({
					afterSequence: numberOption(options, "after"),
					limit: numberOption(options, "limit"),
				}),
			);
		}
		return failure(
			command,
			"USAGE_ERROR",
			`Unknown history command '${action}'`,
		);
	}

	private async search(
		command: string,
		options: Record<string, unknown>,
	): Promise<HeadlessResponse<unknown>> {
		const query = stringOption(options, "query");
		if (!query)
			return failure(command, "USAGE_ERROR", "Search requires --query=TEXT");
		const history = await this.macroHistory.list();
		return success(
			command,
			searchHeadless(
				this.notebook.state,
				history.events,
				query,
				stringOption(options, "scope") as never,
			),
		);
	}

	private async extensions(
		command: string,
		parts: string[],
		options: Record<string, unknown>,
	): Promise<HeadlessResponse<unknown>> {
		if (parts[0] !== "reload")
			return failure(
				command,
				"USAGE_ERROR",
				"Only extensions reload is supported",
			);
		const directory = stringOption(options, "directory");
		if (!directory)
			return failure(
				command,
				"USAGE_ERROR",
				"Extension reload requires --directory=PATH",
			);
		const result = await reloadHeadlessExtensions(
			directory,
			undefined,
			this.macroHistory.listeners,
		);
		this.notebook.invalidateDraftBindings();
		this.draftSessions.clear();
		return success(command, {
			active: result.active,
			diagnostics: result.diagnostics,
		});
	}

	private activeTab() {
		return this.getTab();
	}

	private actionResponse(
		command: string,
		data: unknown,
		diagnosticStart: number,
	): HeadlessResponse<unknown> {
		const diagnostics = this.notebook.state.diagnostics.slice(diagnosticStart);
		const conflict = diagnostics.find(
			(item) => item.code.endsWith("CONFLICT") || item.code === "TAB_NOT_FOUND",
		);
		if (conflict)
			return failure(command, "CONFLICT", conflict.message, undefined, [
				{ code: conflict.code, message: conflict.message },
			]);
		return success(
			command,
			data,
			diagnostics.map((item) => ({ code: item.code, message: item.message })),
		);
	}

	private getTab(tabId?: string) {
		const id = tabId ?? this.notebook.state.activeTabId;
		const tab = this.notebook.state.tabs.find((item) => item.tabId === id);
		if (!tab) throw new Error(`Tab '${id}' was not found`);
		return tab;
	}
}

function stringOption(
	options: Record<string, unknown>,
	key: string,
): string | undefined {
	const value = options[key];
	return value === undefined ? undefined : String(value);
}

function numberOption(
	options: Record<string, unknown>,
	key: string,
): number | undefined {
	const value = options[key];
	if (value === undefined) return undefined;
	const result = Number(value);
	return Number.isFinite(result) ? result : undefined;
}
