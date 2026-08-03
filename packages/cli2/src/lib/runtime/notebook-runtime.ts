import { EditorCommandRegistry } from "@stateful-mcp/clinical/session/editor-command-registry";
import { useMemo, useRef } from "react";
import type { UseNotebookReturn } from "../../hooks/useNotebook";
import type { WindowOverlayRoute } from "../editor/overlay";
import {
	buildNotebookExtension,
	commandResultToEffects,
} from "../windows/notebook/extension";
import { getSharedCellCommandDescriptors } from "../windows/shared-cell-commands";

// TODO(cli2-v2): retain editor effects/keymaps, but remove the legacy editor
// registry and shared V1 cell descriptors after the  catalog is wired.
import { builtinExtensions } from "./builtin-extensions";
import type {
	EditorExtension,
	WindowEffect,
	WindowIntent,
	WindowScope,
} from "./extension";
import {
	createWindowRuntime,
	runIntent,
	type WindowRuntime,
} from "./window-profile";

export interface NotebookRuntimeOptions {
	sessionId: string;
	notebook: UseNotebookReturn;
	cellDescriptors: { getDescriptors(): any[] };
	onCommandResultAccepted(): void;
	onAppQuit(): void;
	onOpenOverlay?(route: WindowOverlayRoute, payload?: unknown): void;
	onCloseOverlay?(): void;
	onSwitchWindow?(windowKind: string): void;
	onSubmittingChange?(submitting: boolean): void;
	onMessage?(message: string): void;
	executeVariableCommand?(line: string): Promise<{
		success: boolean;
		message?: string;
	}>;
}

/**
 * Assembles the v2 notebook's extension runtime: registers built-in + notebook
 * extensions scoped to the notebook window, and maps resulting effects onto the
 * live notebook reducer/domain operations.
 */
export function useNotebookRuntime(opts: NotebookRuntimeOptions): {
	runtime: WindowRuntime;
	dispatchCommandLine(line: string): Promise<void>;
	toIntent(line: string): WindowIntent | null;
} {
	const { sessionId, notebook, cellDescriptors } = opts;
	const editorRegistryRef = useRef(EditorCommandRegistry.createDefault());

	const scope: WindowScope = {
		windowKind: "notebook",
		sessionId,
		collection: { kind: "notebook", collectionId: sessionId },
	};

	const onCommand = useMemo(
		() => async (intent: WindowIntent, _scope: WindowScope) => {
			// TODO(cli2-v2): route editor commands to the CLI reducer and direct
			// domain commands to CommandBarService. The copied V1 dispatcher is
			// intentionally disabled in cli2.
			const verb = (intent.arguments["_verb"] as string) ?? intent.id;
			const rest = (intent.arguments["_rest"] as string) ?? "";
			if (verb.toLowerCase() === "var" && opts.executeVariableCommand) {
				return commandResultToEffects(
					await opts.executeVariableCommand(`:var ${rest}`.trim()),
				);
			}
			void notebook;
			return commandResultToEffects({
				success: false,
				message: `cli2: command '${`${verb} ${rest}`.trim()}' awaits  command-bar wiring`,
			});
		},
		[notebook],
	);

	const extensions = useMemo<EditorExtension[]>(() => {
		const ds: any[] = [];
		try {
			ds.push(...editorRegistryRef.current.getDescriptors());
		} catch {
			/* ignore */
		}
		try {
			ds.push(...(cellDescriptors.getDescriptors() ?? []));
		} catch {
			/* ignore */
		}
		return [
			...builtinExtensions,
			buildNotebookExtension({
				editorDescriptors: ds,
				cellDescriptors: ds,
				sharedCellDescriptors: getSharedCellCommandDescriptors(),
				onCommand,
			}),
		];
	}, [cellDescriptors, onCommand]);

	const applyEffects = useMemo(
		() => (effects: WindowEffect[]) => {
			let openedAny = false;
			for (const effect of effects) {
				switch (effect.type) {
					case "document.dispatch":
						notebook.dispatch(effect.action as any);
						break;
					case "editor.mode": {
						notebook.dispatch({ type: "SET_SESSION_MODE", mode: effect.mode });
						break;
					}
					case "editor.defaultInsert":
						notebook.dispatch({
							type: "SET_DEFAULT_INSERT",
							section: effect.section,
							schema: effect.schema,
						});
						break;
					case "router.open": {
						const route = effect.route;
						openedAny = true;
						opts.onOpenOverlay?.(route, effect.payload);
						break;
					}
					case "router.close":
						opts.onCloseOverlay?.();
						break;
					case "router.switchWindow":
						opts.onSwitchWindow?.(effect.windowKind);
						break;
					case "editor.message":
						if (opts.onMessage) opts.onMessage(effect.message);
						else
							notebook.dispatch({
								type: "SET_MESSAGE",
								message: effect.message,
							});
						break;
					case "app.quit":
						opts.onAppQuit();
						break;
					default:
						break;
				}
			}
			if (!openedAny) opts.onCommandResultAccepted();
		},
		[notebook, opts],
	);

	const runtime = useMemo(
		() =>
			createWindowRuntime(
				{ kind: "notebook", extensions, scope, effectHandler: undefined },
				applyEffects,
			),
		[extensions, scope, applyEffects],
	);

	const dispatchCommandLine = async (line: string) => {
		opts.onSubmittingChange?.(true);
		try {
			const intent = runtime.catalog.toIntent(line, scope);
			if (!intent) {
				await notebook.dispatchCommand(line);
				opts.onCommandResultAccepted();
				return;
			}
			await runIntent(runtime, intent, {
				scope,
				editorState: {},
				document: {},
				services: {},
			});
		} finally {
			opts.onSubmittingChange?.(false);
		}
	};

	return {
		runtime,
		dispatchCommandLine,
		toIntent: (line: string) => runtime.catalog.toIntent(line, scope),
	};
}
