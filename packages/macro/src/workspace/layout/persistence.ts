import type {
	WindowLayoutStateManager,
	WindowLayoutStateSnapshot,
} from "./window-layout-state";

export interface StorageStoreLike {
	getItem(key: string): Promise<string | null> | string | null;
	setItem(key: string, value: string): Promise<void> | void;
}

export const LAYOUT_STORAGE_KEY = "macro.workspace.layout";

export async function saveWindowLayoutState(
	manager: WindowLayoutStateManager,
	storage: StorageStoreLike,
): Promise<void> {
	const snapshot = manager.getSnapshot();
	const serializable: Partial<WindowLayoutStateSnapshot> = {
		activeTabId: snapshot.activeTabId,
		sidepanelOpen: snapshot.sidepanelOpen,
		sidepanelPosition: snapshot.sidepanelPosition,
		sidepanelWidthRatio: snapshot.sidepanelWidthRatio,
		activeContainerId: snapshot.activeContainerId,
	};
	await storage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(serializable));
}

export async function loadWindowLayoutState(
	storage: StorageStoreLike,
): Promise<Partial<WindowLayoutStateSnapshot> | null> {
	try {
		const raw = await storage.getItem(LAYOUT_STORAGE_KEY);
		if (!raw) return null;
		return JSON.parse(raw) as Partial<WindowLayoutStateSnapshot>;
	} catch {
		return null;
	}
}
