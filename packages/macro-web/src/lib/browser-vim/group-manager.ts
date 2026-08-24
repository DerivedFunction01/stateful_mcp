import { createBrowserVimController } from "./controller";
import type {
	BrowserVimGroupController,
	BrowserVimGroupManager,
	BrowserVimGroupManagerOptions,
	BrowserVimKeyboardEvent,
} from "./types";

export function createBrowserVimGroupManager(
	initialEnabled = false,
	options?: BrowserVimGroupManagerOptions,
): BrowserVimGroupManager {
	let globalEnabled = initialEnabled;
	const controllers = new Map<string, BrowserVimGroupController>();
	const managerListeners = new Set<() => void>();
	const notifyManager = () => managerListeners.forEach((l) => l());

	function createController(
		groupId: string,
		initialDocId?: string | null,
	): BrowserVimGroupController {
		let activeDocumentId: string | null = initialDocId ?? null;
		const cursorByDocument = new Map<
			string,
			{ cellIndex: number; column: number; count?: number }
		>();

		const baseController = createBrowserVimController(globalEnabled, {
			variant: () =>
				options?.getVariant?.(groupId, activeDocumentId) ?? "scratchpad",
			getKeymap: () => options?.getKeymap?.(),
			getAdapter: () => options?.getAdapter?.(groupId, activeDocumentId),
			onOpenCommandMode: (initialQuery, commandMode, commandToken) =>
				options?.onOpenCommandMode?.(
					groupId,
					initialQuery,
					commandMode,
					commandToken,
				),
			onOpenSearch: (direction, vimSearch) =>
				options?.onOpenSearch?.(groupId, direction, vimSearch),
			onExecuteLine: (lineNum) =>
				options?.onExecuteLine?.(
					groupId,
					activeDocumentId ?? undefined,
					lineNum,
				),
			onExecuteRange: (startLine, endLine) =>
				options?.onExecuteRange?.(
					groupId,
					activeDocumentId ?? undefined,
					startLine,
					endLine,
				),
			onExecuteValidLines: () =>
				options?.onExecuteValidLines?.(groupId, activeDocumentId ?? undefined),
			onPreviewLine: () =>
				options?.onPreviewLine?.(groupId, activeDocumentId ?? undefined),
		});

		const groupController: BrowserVimGroupController = {
			groupId,
			getActiveDocumentId: () => activeDocumentId,
			getState: () => baseController.getState(),
			setEnabled: (enabled) => baseController.setEnabled(enabled),
			setActiveCell: (index, count, column) => {
				baseController.setActiveCell(index, count, column);
				if (activeDocumentId) {
					cursorByDocument.set(activeDocumentId, {
						cellIndex: index,
						column: column ?? 0,
						count,
					});
				}
			},
			setPointerTarget: (index, count, column, dragging) => {
				baseController.setPointerTarget(index, count, column, dragging);
				if (activeDocumentId) {
					cursorByDocument.set(activeDocumentId, {
						cellIndex: index,
						column: column ?? 0,
						count,
					});
				}
			},
			exitCommandMode: () => baseController.exitCommandMode(),
			handleKeyDown: (event) => baseController.handleKeyDown(event),
			subscribe: (listener) => baseController.subscribe(listener),
			activateDocument: (nextDocId) => {
				if (activeDocumentId && activeDocumentId !== nextDocId) {
					const curState = baseController.getState();
					const existing = cursorByDocument.get(activeDocumentId);
					cursorByDocument.set(activeDocumentId, {
						cellIndex: curState.activeCellIndex,
						column: curState.caretColumn,
						count: existing?.count ?? Math.max(curState.activeCellIndex + 1, 1),
					});
				}
				activeDocumentId = nextDocId ?? null;
				baseController.exitCommandMode();
				if (baseController.getState().mode !== "NORMAL" && globalEnabled) {
					baseController.handleKeyDown({
						key: "Escape",
						preventDefault: () => undefined,
						stopPropagation: () => undefined,
					});
				}
				if (nextDocId && cursorByDocument.has(nextDocId)) {
					const saved = cursorByDocument.get(nextDocId)!;
					const adapter = options?.getAdapter?.(groupId, nextDocId);
					const cellCount =
						adapter?.getCellCount?.() ??
						Math.max(saved.count ?? 1, saved.cellIndex + 1, 1);
					baseController.setActiveCell(
						saved.cellIndex,
						cellCount,
						saved.column,
					);
				} else {
					const adapter = options?.getAdapter?.(groupId, nextDocId);
					const cellCount = adapter?.getCellCount?.() ?? 1;
					baseController.setActiveCell(0, cellCount, 0);
				}
			},
			resetView: (_reason) => {
				if (activeDocumentId) {
					const curState = baseController.getState();
					const existing = cursorByDocument.get(activeDocumentId);
					cursorByDocument.set(activeDocumentId, {
						cellIndex: curState.activeCellIndex,
						column: curState.caretColumn,
						count: existing?.count ?? Math.max(curState.activeCellIndex + 1, 1),
					});
				}
				baseController.exitCommandMode();
				if (baseController.getState().mode !== "NORMAL" && globalEnabled) {
					baseController.handleKeyDown({
						key: "Escape",
						preventDefault: () => undefined,
						stopPropagation: () => undefined,
					});
				}
			},
		};

		return groupController;
	}

	return {
		getGroupController: (groupId) => {
			let controller = controllers.get(groupId);
			if (!controller) {
				controller = createController(groupId);
				controllers.set(groupId, controller);
				notifyManager();
			}
			return controller;
		},
		getState: (groupId) => {
			if (groupId) {
				let controller = controllers.get(groupId);
				if (!controller) {
					controller = createController(groupId);
					controllers.set(groupId, controller);
					notifyManager();
				}
				return controller.getState();
			}
			const first = controllers.values().next().value;
			return (
				first?.getState() ?? {
					enabled: globalEnabled,
					mode: globalEnabled ? "NORMAL" : "INSERT",
					activeCellIndex: 0,
					caretColumn: 0,
					visualRange: null,
					selection: null,
					commandText: "",
				}
			);
		},
		setEnabled: (enabled) => {
			if (globalEnabled !== enabled) {
				globalEnabled = enabled;
				for (const controller of controllers.values()) {
					controller.setEnabled(enabled);
				}
				notifyManager();
			}
		},
		initGroup: (groupId, documentId) => {
			let controller = controllers.get(groupId);
			if (!controller) {
				controller = createController(groupId, documentId);
				controllers.set(groupId, controller);
				notifyManager();
			} else if (documentId !== undefined) {
				controller.activateDocument(documentId);
			}
			return controller;
		},
		removeGroup: (groupId) => {
			if (controllers.delete(groupId)) {
				notifyManager();
			}
		},
		activateDocument: (groupId, documentId) => {
			let controller = controllers.get(groupId);
			if (!controller) {
				controller = createController(groupId, documentId);
				controllers.set(groupId, controller);
				notifyManager();
			} else {
				controller.activateDocument(documentId);
			}
		},
		resetGroup: (groupId, reason) => {
			const controller = controllers.get(groupId);
			controller?.resetView(reason);
		},
		exitCommandMode: (groupId) => {
			if (groupId) {
				controllers.get(groupId)?.exitCommandMode();
			} else {
				for (const controller of controllers.values()) {
					controller.exitCommandMode();
				}
			}
		},
		handleKeyDown: (groupId, event) => {
			let controller = controllers.get(groupId);
			if (!controller) {
				controller = createController(groupId);
				controllers.set(groupId, controller);
				notifyManager();
			}
			return controller.handleKeyDown(event as BrowserVimKeyboardEvent);
		},
		subscribe: (listener, groupId) => {
			if (groupId) {
				let controller = controllers.get(groupId);
				if (!controller) {
					controller = createController(groupId);
					controllers.set(groupId, controller);
					notifyManager();
				}
				return controller.subscribe(listener);
			}
			managerListeners.add(listener);
			return () => managerListeners.delete(listener);
		},
		listGroups: () => [...controllers.keys()],
	};
}
