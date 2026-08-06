import type {
	CommandMacroTemplatePart,
	CommandSyntaxProfile,
	MacroAuthoringSession,
	MacroDefinition,
} from "@stateful-mcp/clinical";
import { findNextMacroChild } from "@stateful-mcp/clinical";
import { Box, useInput, useStdout } from "ink";
import { type ReactElement, useEffect, useReducer, useRef } from "react";
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
} from "../lib/editor";
import type { AutocompleteSuggestion } from "../lib/editor/autocomplete";
import {
	deriveCompletionSession,
	reduceCompletion,
} from "../lib/editor/completion-state";
import type { EditorKeymapProfile } from "../lib/editor/editor-keymap-profile";
import type { MacroSlotProjection } from "../lib/editor/macro-slots";
import {
	type NavigationContext,
	type NavigationDirection,
	navigationDirectionFor,
} from "../lib/editor/navigation";
import { deriveWindowLayout } from "../lib/editor/window-layout";
import { sidebarTabForAlt } from "./SidebarActivityBar";
import { WindowLayoutContext } from "./WindowLayoutContext";
import { WorkspaceHelpScreen } from "./WorkspaceHelpScreen";

export interface WindowContainerProps {
	definition: WindowDefinition;
	keymap: KeymapPolicy;
	keymapProfile?: EditorKeymapProfile;
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
	completionProvider?: (partial: string) => AutocompleteSuggestion[];
	macroSlots?: MacroSlotProjection[];
	cursorOffset?: number;
	syntaxProfile: CommandSyntaxProfile;
	childDefinitions?: MacroDefinition[];
	macroSession?: MacroAuthoringSession;
	assessmentSubTabsActive?: boolean;
	suspendEditorInput?: boolean;
	historySearchOpen?: boolean;
	historySearchQuery?: string;
	onHistorySearchQuery?: (query: string) => void;
	onHistorySearchNext?: () => void;
	onHistorySearchPrev?: () => void;
	onHistorySearchSelect?: () => void;
	onHistorySearchClose?: () => void;
	navigationContext?: NavigationContext;
	navigationSearchOpen?: boolean;
	navigationSearchQuery?: string;
	onNavigationSearchQuery?: (query: string) => void;
	onNavigationSearchNext?: () => void;
	onNavigationSearchPrev?: () => void;
	onNavigationSearchSelect?: () => void;
	onNavigationSearchClose?: () => void;
	onNavigationMove?: (direction: NavigationDirection) => void;
	onNavigationSearchOpen?: () => void;
	onNavigationToggleSelection?: () => void;
	onNavigationSelectAll?: () => void;
	onNavigationClearSelection?: () => void;
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
	keymapProfile,
	document,
	domain,
	catalog,
	context,
	editorState,
	onEditorAction,
	overlay = null,
	onOverlayAction,
	renderOverlay,
	completionProvider,
	macroSlots,
	cursorOffset,
	syntaxProfile,
	childDefinitions = [],
	macroSession,
	assessmentSubTabsActive = false,
	suspendEditorInput = false,
	historySearchOpen = false,
	historySearchQuery = "",
	onHistorySearchQuery,
	onHistorySearchNext,
	onHistorySearchPrev,
	onHistorySearchSelect,
	onHistorySearchClose,
	navigationContext,
	navigationSearchOpen = false,
	navigationSearchQuery = "",
	onNavigationSearchQuery,
	onNavigationSearchNext,
	onNavigationSearchPrev,
	onNavigationSearchSelect,
	onNavigationSearchClose,
	onNavigationMove,
	onNavigationSearchOpen,
	onNavigationToggleSelection,
	onNavigationSelectAll,
	onNavigationClearSelection,
}: WindowContainerProps) {
	const [kernel, dispatch] = useReducer(
		reduceEditorKernel,
		undefined,
		createEditorKernelState,
	);
	const view = document?.getView();
	const current = editorState ?? kernel;
	const { stdout } = useStdout();
	const emit = (action: EditorAction) => {
		if (onEditorAction) onEditorAction(action);
		else dispatch(action);
	};

	const autocompleteTimeoutRef = useRef<any>(null);

	const triggerAutocomplete = (newLine: string, type: "macro" | "command") => {
		if (autocompleteTimeoutRef.current) {
			clearTimeout(autocompleteTimeoutRef.current);
		}
		autocompleteTimeoutRef.current = setTimeout(() => {
			const token =
				type === "macro"
					? syntaxProfile.macroStartToken
					: syntaxProfile.directCommandToken;
			if (!newLine.startsWith(token)) {
				emit({
					type: "SET_COMPLETION",
					completion: { status: "idle" },
				});
				return;
			}
			const partial = newLine.slice(token.length);
			const getSg =
				type === "macro"
					? completionProvider || (() => [])
					: (p: string) => catalog.getSuggestions(p, context);
			const suggestions = getSg(partial);
			if (suggestions.length > 0) {
				const session = deriveCompletionSession(newLine, syntaxProfile);
				if (session) {
					emit({
						type: "SET_COMPLETION",
						completion: {
							status: "cycling",
							candidates: suggestions,
							highlightIndex: -1,
							session,
						},
					});
					return;
				}
			}
			emit({
				type: "SET_COMPLETION",
				completion: { status: "idle" },
			});
		}, 200);
	};

	const clearAutocompleteTimeout = () => {
		if (autocompleteTimeoutRef.current) {
			clearTimeout(autocompleteTimeoutRef.current);
		}
	};

	useEffect(() => {
		return () => {
			if (autocompleteTimeoutRef.current) {
				clearTimeout(autocompleteTimeoutRef.current);
			}
		};
	}, []);

	/**
	 * Returns the prefix string (from the next unbound child macro's authoring
	 * template) to append for chain expansion, or null if no chain is pending.
	 */
	const buildChainPrefix = (): string | null => {
		if (!childDefinitions.length || !macroSlots) return null;
		const nextChild = findNextMacroChild(childDefinitions, macroSlots);
		if (!nextChild) return null;
		const tmpl = nextChild.authoringTemplates?.[0];
		if (tmpl) {
			// Build the literal prefix up to (not including) the first slot
			const literalPrefix: string[] = [];
			for (const p of tmpl.parts as CommandMacroTemplatePart[]) {
				if (p.kind === "literal") {
					literalPrefix.push(p.text);
				} else {
					break; // stop at first slot — user fills the rest
				}
			}
			return literalPrefix.join("") || null;
		}
		return null;
	};

	const applyKeyResolution = async (
		input: string,
		key: Parameters<KeymapPolicy["resolve"]>[1],
		mode: "NORMAL" | "VISUAL",
	) => {
		const pending = "";
		const resolution = keymap.resolve(
			input,
			key,
			mode,
			pending,
			current.commandKind,
		);
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
		if (navigationSearchOpen) {
			if (key.escape) {
				onNavigationSearchClose?.();
				return;
			}
			if (key.return) {
				onNavigationSearchSelect?.();
				return;
			}
			if (key.backspace || key.delete) {
				onNavigationSearchQuery?.(navigationSearchQuery.slice(0, -1));
				return;
			}
			if (key.upArrow || (key.ctrl && _input === "p")) {
				onNavigationSearchPrev?.();
				return;
			}
			if (key.downArrow || (key.ctrl && _input === "n")) {
				onNavigationSearchNext?.();
				return;
			}
			if (_input.length === 1 && !key.ctrl && !key.meta && _input >= " ") {
				onNavigationSearchQuery?.(navigationSearchQuery + _input);
				return;
			}
			return;
		}
		// Alt+1..3 switch the right-hand sidebar activity bar view.
		if (key.meta && _input.length === 1 && _input >= "1" && _input <= "3") {
			const tab = sidebarTabForAlt(_input);
			if (tab) {
				emit({ type: "SET_SIDEBAR_TAB", tab });
				return;
			}
		}

		if (suspendEditorInput) return;

		if (
			current.mode === "NORMAL" &&
			navigationContext &&
			(onNavigationMove || onNavigationSearchOpen)
		) {
			const navigationResolution = keymap.resolve(
				_input,
				key,
				current.mode,
				"",
				current.commandKind,
			);
			if (
				navigationResolution.kind === "generic" &&
				navigationResolution.action.type === "SEARCH"
			) {
				onNavigationSearchOpen?.();
				return;
			}
			if (
				navigationResolution.kind === "document" &&
				navigationResolution.action.type === "move"
			) {
				const direction = navigationDirectionFor(navigationResolution.action);
				if (direction) onNavigationMove?.(direction);
				return;
			}
			if (_input === " " && !key.ctrl && !key.meta) {
				onNavigationToggleSelection?.();
				return;
			}
			if (_input === "a" && !key.ctrl && !key.meta) {
				onNavigationSelectAll?.();
				return;
			}
			if (_input === "u" && !key.ctrl && !key.meta) {
				onNavigationClearSelection?.();
				return;
			}
		}

		if (current.mode === "INSERT" && current.commandKind !== "macro") {
			emit({ type: key.escape ? "CANCEL" : "ENTER_MACRO" });
			return;
		}

		if (
			current.mode === "MACRO" ||
			(current.mode === "INSERT" && current.commandKind === "macro")
		) {
			if (_input === "v" && !key.ctrl && !key.meta) {
				emit({ type: "ENTER_VISUAL" });
				return;
			}
			if (key.escape) {
				clearAutocompleteTimeout();
				if (macroSession) {
					macroSession.dispatch({ type: "escape" });
				}
				if (current.completion.status === "cycling") {
					emit({
						type: "SET_COMPLETION",
						completion: { status: "idle" },
					});
				}
				emit({ type: "CANCEL" });
				return;
			}
			if (key.ctrl && (_input === "c" || _input === "q")) {
				clearAutocompleteTimeout();
				emit({ type: "CANCEL" });
				return;
			}
			if (key.return) {
				if (macroSession) {
					macroSession.dispatch({ type: "submit" });
				}
				emit({ type: "SUBMIT_MACRO" });
				return;
			}
			if (key.ctrl && _input === "u") {
				if (macroSession) {
					macroSession.dispatch({ type: "unlock_active" });
				}
				emit({ type: "UNLOCK_MACRO" });
				return;
			}
			if (key.upArrow || key.downArrow) {
				return;
			}
			if (key.backspace) {
				if (macroSession) {
					macroSession.dispatch({ type: "backspace" });
				}
				emit({ type: "BACKSPACE" });
				return;
			}
			if (key.leftArrow || key.rightArrow) {
				if (macroSession) {
					macroSession.dispatch({
						type: "move_cursor",
						delta: key.leftArrow ? -1 : 1,
					});
				}
				if (current.completion.status === "cycling") {
					emit({
						type: "SET_COMPLETION",
						completion: { status: "idle" },
					});
				}
				emit({ type: "MOVE_CURSOR", delta: key.leftArrow ? -1 : 1 });
				return;
			}
			if (key.home) {
				if (macroSession) {
					macroSession.dispatch({ type: "cursor_home" });
				}
				emit({ type: "CURSOR_HOME" });
				return;
			}
			if (key.end) {
				if (macroSession) {
					macroSession.dispatch({ type: "cursor_end" });
				}
				emit({ type: "CURSOR_END" });
				return;
			}
			if (key.tab) {
				// Child expansion is the only remaining Tab behavior in Macro mode.
				if (
					(cursorOffset ?? current.draftText.length) ===
					current.draftText.length
				) {
					const chainPrefix = buildChainPrefix();
					if (chainPrefix) {
						emit({ type: "INSERT_TEXT", text: ` ${chainPrefix}` });
					}
				}
				return;
			}
			if (_input === " " && current.mode === "MACRO") {
				emit({
					type: "SET_COMPLETION",
					completion: { status: "idle" },
				});
				emit({ type: "INSERT_TEXT", text: " " });
				return;
			}
			if (_input.length === 1 && !key.ctrl && !key.meta) {
				emit({ type: "INSERT_TEXT", text: _input });
			}
			return;
		}

		if (current.mode === "VISUAL" && current.commandKind === "macro") {
			if (key.escape) {
				emit({ type: "CANCEL" });
				return;
			}
			if (key.leftArrow || key.rightArrow || key.upArrow || key.downArrow) {
				emit({
					type: "EXTEND_VISUAL",
					delta: key.leftArrow || key.upArrow ? -1 : 1,
				});
				return;
			}
			if (_input === "d" || _input === "c") {
				emit({ type: "DELETE_VISUAL" });
				return;
			}
			if (_input === "y") {
				emit({ type: "YANK_VISUAL" });
				return;
			}
			return;
		}

		if (current.mode === "COMMAND") {
			if (key.escape) {
				clearAutocompleteTimeout();
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
					syntaxProfile,
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
				}
				return;
			}
			if (key.return) {
				const transition = reduceCompletion(
					current.completion,
					{ kind: "enter" },
					current.draftText,
					(partial) => catalog.getSuggestions(partial, context),
					syntaxProfile,
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
				triggerAutocomplete(current.draftText.slice(0, -1), "command");
				return;
			}
			if (_input === " ") {
				const transition = reduceCompletion(
					current.completion,
					{ kind: "space" },
					current.draftText,
					(partial) => catalog.getSuggestions(partial, context),
					syntaxProfile,
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
				triggerAutocomplete(current.draftText + _input, "command");
			}
			return;
		}

		if (current.mode === "NORMAL" && key.tab) {
			emit({
				type: key.shift
					? assessmentSubTabsActive
						? "PREVIOUS_ASSESSMENT_TAB"
						: "PREVIOUS_WORKSPACE_TAB"
					: "NEXT_WORKSPACE_TAB",
			});
			return;
		}

		if (
			current.mode === "NORMAL" &&
			(_input === "n" || _input === "N") &&
			!key.ctrl &&
			!key.meta
		) {
			emit({ type: "OPEN_SCRATCHPAD" } as any);
			return;
		}

		const mode = view?.selection ? "VISUAL" : "NORMAL";
		await applyKeyResolution(_input, key, mode);
	});

	const regions = definition.regions();
	const bySlot = (slot: string) => regions.filter((r) => r.slot === slot);
	const navigationRegions = bySlot("navigation");
	const primaryRegions = bySlot("primary");
	const sidebarRegions = bySlot("sidebar");
	const layout = deriveWindowLayout({
		columns: stdout.columns ?? 80,
		rows: stdout.rows ?? 24,
		sidebarOpen: sidebarRegions.length > 0,
	});

	// Modal overlay: the overlay content owns input; the editor is not rendered
	// and the container does not process keys while it is active.
	if (overlay && renderOverlay) {
		return renderOverlay(overlay);
	}

	if (current.showHelp && overlay === null) {
		return (
			<WorkspaceHelpScreen
				descriptors={catalog.getDescriptors(context)}
				keymapProfile={keymapProfile}
				onClose={() => emit({ type: "SHOW_HELP", show: false })}
			/>
		);
	}

	const renderRegions = (target: typeof regions) =>
		target.map((region) => <Box key={region.key}>{region.render()}</Box>);
	const renderBottomRegions = () => (
		<>
			{bySlot("command").map((r) => (
				<Box key={r.key} width="100%">
					{r.render()}
				</Box>
			))}
			{bySlot("status").map((r) => (
				<Box key={r.key} width="100%">
					{r.render()}
				</Box>
			))}
			{bySlot("footer").map((r) => (
				<Box key={r.key} width="100%">
					{r.render()}
				</Box>
			))}
		</>
	);

	return (
		<WindowLayoutContext.Provider value={layout}>
			<Box width="100%" height={layout.rows}>
				{layout.wide ? (
					<>
						<Box
							flexDirection="column"
							width={layout.historyWidth + layout.centerWidth}
							height={layout.rows}
						>
							<Box
								flexDirection="row"
								height={layout.workspaceRows}
								width="100%"
							>
								<Box width={layout.historyWidth} height="100%">
									{renderRegions(navigationRegions)}
								</Box>
								<Box width={layout.centerWidth} height="100%">
									{renderRegions(primaryRegions)}
								</Box>
							</Box>
							{renderBottomRegions()}
						</Box>
						{sidebarRegions.length > 0 && (
							<Box
								flexDirection="column"
								width={layout.detailsWidth}
								height={layout.detailsRows}
								borderStyle="single"
							>
								{sidebarRegions.map((region) => (
									<Box key={region.key} flexGrow={1} overflow="hidden">
										{region.render()}
									</Box>
								))}
							</Box>
						)}
					</>
				) : (
					<Box flexDirection="column" width="100%" height={layout.rows}>
						<Box height={layout.workspaceRows} width="100%">
							{sidebarRegions.length > 0 ? (
								<Box height="100%" width="100%" borderStyle="single">
									{sidebarRegions.map((region) => region.render())}
								</Box>
							) : (
								<Box flexDirection="column" height="100%" width="100%">
									<Box
										height={Math.max(1, Math.floor(layout.workspaceRows / 2))}
									>
										{renderRegions(navigationRegions)}
									</Box>
									<Box flexGrow={1}>{renderRegions(primaryRegions)}</Box>
								</Box>
							)}
						</Box>
						{renderBottomRegions()}
					</Box>
				)}
			</Box>
		</WindowLayoutContext.Provider>
	);
}
