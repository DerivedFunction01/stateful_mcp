import { Box, useInput } from "ink";
import { type ReactElement, useReducer } from "react";
import {
	type CommandCatalog,
	createEditorKernelState,
	type DocumentPort,
	type DomainPort,
	type EditorAction,
	type EditorContext,
	type EditorKernelState,
	type KeymapPolicy,
	reduceEditorKernel,
	type WindowDefinition,
	type WindowOverlay,
	type WindowOverlayAction,
} from "../../lib/cell-editor";
import { reduceCompletion } from "../../lib/completion-state";
import { WorkspaceHelpScreen } from "../WorkspaceHelpScreen";

export interface WindowContainerProps {
	definition: WindowDefinition;
	keymap: KeymapPolicy;
	document?: DocumentPort;
	domain: DomainPort;
	catalog: CommandCatalog;
	context: EditorContext;
	editorState?: EditorKernelState;
	onEditorAction?: (action: EditorAction) => void;
	/** Active modal overlay; when set, the overlay owns input exclusively. */
	overlay?: WindowOverlay | null;
	onOverlayAction?: (action: WindowOverlayAction) => void;
	/** Renders the content for an active overlay (window-specific). */
	renderOverlay?: (overlay: WindowOverlay) => ReactElement | null;
}

/**
 * Shared full-screen editor container. Owns the single `useInput` for its whole
 * area and the generic window/modal routing (help overlay). Domain/document
 * state lives in the injected ports; regions render window-specific pieces.
 *
 * NOTE: v2 is a parallel scaffold. Full notebook parity (visual mode, preview
 * overlays, command history) is wired incrementally; v1 remains the default.
 */
export function WindowContainer({
	definition,
	keymap,
	document,
	domain,
	catalog,
	context,
	editorState,
	onEditorAction,
	overlay = null,
	onOverlayAction,
	renderOverlay,
}: WindowContainerProps) {
	const [kernel, dispatch] = useReducer(
		reduceEditorKernel,
		undefined,
		createEditorKernelState,
	);
	const view = document?.getView();
	const current = editorState ?? kernel;
	const emit = (action: EditorAction) => {
		if (onEditorAction) onEditorAction(action);
		else dispatch(action);
	};

	const applyKeyResolution = async (
		input: string,
		key: Parameters<KeymapPolicy["resolve"]>[1],
		mode: "NORMAL" | "VISUAL",
	) => {
		const pending = "";
		const resolution = keymap.resolve(input, key, mode, pending);
		switch (resolution.kind) {
			case "generic":
				emit(resolution.action as EditorAction);
				return;
			case "document":
				document?.dispatch(resolution.action);
				return;
			case "domain": {
				const action = resolution.action;
				if (action.type === "run") {
					const selection = view?.selection;
					const cellIds =
						view && selection != null
							? view.cells
									.slice(
										Math.min(selection.start, selection.end),
										Math.max(selection.start, selection.end) + 1,
									)
									.map((c) => c.cellId)
							: undefined;
					await domain.run(context, {
						indexes: action.indexes,
						cellIds: cellIds ?? action.cellIds,
					});
				} else if (action.type === "preview") {
					await domain.preview(context);
				} else if (typeof (domain as any)[action.type] === "function") {
					await (domain as any)[action.type](context, action);
				}
				return;
			}
			case "none":
				return;
		}
	};

	useInput(async (_input, key) => {
		if (current.showHelp || overlay) return;

		if (current.mode === "INSERT") {
			if (key.escape) {
				emit({ type: "CANCEL" });
				return;
			}
			if (key.return && !key.ctrl && !key.meta) {
				emit({ type: "NEWLINE" });
				return;
			}
			if (key.return && key.ctrl) {
				emit({ type: "CANCEL" });
				return;
			}
			if (key.backspace) {
				emit({ type: "BACKSPACE" });
				return;
			}
			if (_input.length === 1 && !key.ctrl && !key.meta) {
				emit({ type: "INSERT_TEXT", text: _input });
			}
			return;
		}

		if (current.mode === "COMMAND") {
			if (key.escape) {
				emit({ type: "CANCEL" });
				return;
			}
			if (key.upArrow || key.downArrow) {
				emit({
					type: key.upArrow ? "HISTORY_PREV" : "HISTORY_NEXT",
				});
				return;
			}
			if (key.tab) {
				const transition = reduceCompletion(
					current.completion,
					{ kind: "tab", shift: Boolean(key.shift) },
					current.draftText,
					(partial) => catalog.getSuggestions(partial, context),
				);
				emit({
					type: "SET_COMPLETION",
					completion: transition.completionState,
				});
				return;
			}
			if (key.return) {
				const transition = reduceCompletion(
					current.completion,
					{ kind: "enter" },
					current.draftText,
					(partial) => catalog.getSuggestions(partial, context),
				);
				emit({
					type: "SET_COMPLETION",
					completion: transition.completionState,
				});
				const line = transition.executeLine ?? current.draftText;
				if (line.slice(1).trim()) {
					await domain.dispatchCommand(line, context);
				}
				emit({ type: "CANCEL" });
				return;
			}
			if (key.backspace) {
				emit({ type: "BACKSPACE" });
				return;
			}
			if (_input === " ") {
				const transition = reduceCompletion(
					current.completion,
					{ kind: "space" },
					current.draftText,
					(partial) => catalog.getSuggestions(partial, context),
				);
				emit({
					type: "SET_COMPLETION",
					completion: transition.completionState,
				});
				if (transition.committedLine) {
					emit({
						type: "COMMIT_COMPLETION",
						line: transition.committedLine,
					});
				} else if (transition.shouldAppend) {
					emit({ type: "INSERT_TEXT", text: transition.shouldAppend });
				}
				return;
			}
			if (_input.length === 1 && !key.ctrl && !key.meta) {
				emit({ type: "INSERT_TEXT", text: _input });
			}
			return;
		}

		const mode = view?.selection ? "VISUAL" : "NORMAL";
		await applyKeyResolution(_input, key, mode);
	});

	const regions = definition.regions();
	const bySlot = (slot: string) => regions.filter((r) => r.slot === slot);

	// Modal overlay: the overlay content owns input; the editor is not rendered
	// and the container does not process keys while it is active.
	if (overlay && renderOverlay) {
		return renderOverlay(overlay);
	}

	if (current.showHelp && overlay === null) {
		return (
			<WorkspaceHelpScreen
				descriptors={catalog.getDescriptors(context)}
				onClose={() => emit({ type: "SHOW_HELP", show: false })}
			/>
		);
	}

	return (
		<Box flexDirection="column" width="100%" height="100%">
			<Box flexDirection="row" flexGrow={1} width="100%">
				<Box flexDirection="column" flexGrow={1}>
					{bySlot("primary").map((r) => (
						<Box key={r.key} flexGrow={1}>
							{r.render()}
						</Box>
					))}
				</Box>
				{bySlot("sidebar").length > 0 &&
					(() => {
						const content = bySlot("sidebar")
							.map((r) => ({ key: r.key, content: r.render() }))
							.filter((r) => r.content !== null);
						if (content.length === 0) return null;
						return (
							<Box flexDirection="column" width={30} borderStyle="single">
								{content.map((r) => (
									<Box key={r.key}>{r.content}</Box>
								))}
							</Box>
						);
					})()}
			</Box>
			{bySlot("command").map((r) => (
				<Box key={r.key}>{r.render()}</Box>
			))}
			{bySlot("status").map((r) => (
				<Box key={r.key}>{r.render()}</Box>
			))}
			{bySlot("footer").map((r) => (
				<Box key={r.key}>{r.render()}</Box>
			))}
		</Box>
	);
}
