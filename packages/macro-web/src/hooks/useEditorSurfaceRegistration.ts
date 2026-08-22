import type { WorkspaceSnapshot } from "@stateful-mcp/macro-protocol";
import { type RefObject, useEffect, useMemo } from "react";
import type {
	BrowserEditorSurfaceAdapter,
	BrowserVimController,
	BrowserVimState,
} from "../lib/browser-vim";
import { useEditorSurfaceRegistry } from "../lib/editor-surface-registry";

export interface UseEditorSurfaceRegistrationOptions {
	readonly snapshot?: WorkspaceSnapshot;
	readonly surfaceRef: RefObject<HTMLElement | null>;
	readonly surfaceFocused: boolean;
	readonly vimState: BrowserVimState;
	readonly vimController: BrowserVimController;
	readonly getSurfaceAdapter: () => BrowserEditorSurfaceAdapter | undefined;
}

export function useEditorSurfaceRegistration({
	snapshot,
	surfaceRef,
	surfaceFocused,
	vimState,
	vimController,
	getSurfaceAdapter,
}: UseEditorSurfaceRegistrationOptions) {
	const registry = useEditorSurfaceRegistry();

	const surfaceId = useMemo(
		() => `editor:${snapshot?.editor.activeDocumentId ?? "inactive"}`,
		[snapshot?.editor.activeDocumentId],
	);

	useEffect(() => {
		const element = surfaceRef.current;
		if (!element) return;
		registry.register({
			id: surfaceId,
			element,
			focused: surfaceFocused,
			context: {
				focusedRegion: "main",
				activeDocumentId: snapshot?.editor.activeDocumentId ?? undefined,
				editorMode: vimState.mode,
				textInputOwner: "editor",
			},
			vimEnabled: vimState.enabled,
			mode: vimState.mode,
			adapter: getSurfaceAdapter(),
			handleKeyDown: (event) => vimController.handleKeyDown(event),
		});
		return () => registry.unregister(surfaceId);
	}, [registry, surfaceId, surfaceRef, surfaceFocused, snapshot?.editor.activeDocumentId, vimState.mode, vimState.enabled, getSurfaceAdapter, vimController]);

	useEffect(() => {
		registry.update(surfaceId, {
			focused: surfaceFocused,
			context: {
				focusedRegion: "main",
				activeDocumentId: snapshot?.editor.activeDocumentId ?? undefined,
				editorMode: vimState.mode,
				textInputOwner: "editor",
			},
			vimEnabled: vimState.enabled,
			mode: vimState.mode,
			adapter: getSurfaceAdapter(),
			handleKeyDown: (event) => vimController.handleKeyDown(event),
		});
	}, [
		registry,
		surfaceId,
		surfaceFocused,
		snapshot?.editor.activeDocumentId,
		vimController,
		vimState.enabled,
		vimState.mode,
		getSurfaceAdapter,
	]);

	return {
		surfaceId,
		registry,
	};
}
