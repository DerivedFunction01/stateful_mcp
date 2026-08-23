import type { WorkspaceSnapshot } from "@stateful-mcp/macro-protocol";
import { type RefObject, useEffect, useMemo } from "react";
import type {
	BrowserEditorSurfaceAdapter,
	BrowserVimController,
	BrowserVimKeyboardEvent,
	BrowserVimState,
} from "../lib/browser-vim";
import { useEditorSurfaceRegistry } from "../lib/editor-surface-registry";

export interface UseEditorSurfaceRegistrationOptions {
	readonly snapshot?: WorkspaceSnapshot;
	readonly groupId?: string;
	readonly documentId?: string;
	readonly surfaceRef: RefObject<HTMLElement | null>;
	readonly surfaceFocused: boolean;
	readonly vimState: BrowserVimState;
	readonly vimController?: BrowserVimController;
	readonly handleKeyDown?: (event: BrowserVimKeyboardEvent) => boolean;
	readonly getSurfaceAdapter: () => BrowserEditorSurfaceAdapter | undefined;
}

export function useEditorSurfaceRegistration({
	snapshot,
	groupId,
	documentId,
	surfaceRef,
	surfaceFocused,
	vimState,
	vimController,
	handleKeyDown,
	getSurfaceAdapter,
}: UseEditorSurfaceRegistrationOptions) {
	const registry = useEditorSurfaceRegistry();

	const resolvedGroupId =
		groupId ?? snapshot?.editor.activeGroupId ?? "inactive";
	const resolvedDocId =
		documentId ?? snapshot?.editor.activeDocumentId ?? "inactive";

	const surfaceId = useMemo(
		() => `editor:${resolvedGroupId}:${resolvedDocId}`,
		[resolvedGroupId, resolvedDocId],
	);

	const onKeyDown =
		handleKeyDown ?? ((event) => vimController?.handleKeyDown(event) ?? false);

	useEffect(() => {
		const element = surfaceRef.current;
		if (!element) return;
		registry.register({
			id: surfaceId,
			groupId: resolvedGroupId,
			documentId: resolvedDocId,
			element,
			focused: surfaceFocused,
			context: {
				focusedRegion: "main",
				activeDocumentId:
					resolvedDocId !== "inactive" ? resolvedDocId : undefined,
				editorMode: vimState.mode,
				textInputOwner: "editor",
			},
			vimEnabled: vimState.enabled,
			mode: vimState.mode,
			adapter: getSurfaceAdapter(),
			handleKeyDown: onKeyDown,
		});
		return () => registry.unregister(surfaceId);
	}, [
		registry,
		surfaceId,
		surfaceRef,
		surfaceFocused,
		resolvedDocId,
		resolvedGroupId,
		vimState.mode,
		vimState.enabled,
		getSurfaceAdapter,
		onKeyDown,
	]);

	useEffect(() => {
		registry.update(surfaceId, {
			focused: surfaceFocused,
			groupId: resolvedGroupId,
			documentId: resolvedDocId,
			context: {
				focusedRegion: "main",
				activeDocumentId:
					resolvedDocId !== "inactive" ? resolvedDocId : undefined,
				editorMode: vimState.mode,
				textInputOwner: "editor",
			},
			vimEnabled: vimState.enabled,
			mode: vimState.mode,
			adapter: getSurfaceAdapter(),
			handleKeyDown: onKeyDown,
		});
	}, [
		registry,
		surfaceId,
		surfaceFocused,
		resolvedDocId,
		resolvedGroupId,
		vimState.enabled,
		vimState.mode,
		getSurfaceAdapter,
		onKeyDown,
	]);

	return {
		surfaceId,
		registry,
	};
}
