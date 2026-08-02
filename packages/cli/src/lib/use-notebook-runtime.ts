import { EditorCommandRegistry } from "@stateful-mcp/clinical/session/editor-command-registry";
import { useMemo, useRef } from "react";
import type { UseNotebookReturn } from "../hooks/useNotebook";
import { builtinExtensions } from "./builtin-extensions";
import type {
	EditorExtension,
	WindowEffect,
	WindowIntent,
	WindowScope,
} from "./editor-extension";
import {
	buildNotebookExtension,
	commandResultToEffects,
} from "./notebook-extension";
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
	onOpenOverlay?(route: "help" | "preview" | "info", payload?: unknown): void;
	onCloseOverlay?(): void;
	onSwitchWindow?(windowKind: string): void;
	onSubmittingChange?(submitting: boolean): void;
	onMessage?(message: string): void;
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
			const verb = (intent.arguments["_verb"] as string) ?? intent.id;
			const rest = (intent.arguments["_rest"] as string) ?? "";
			// Defer to the existing notebook command dispatcher for execution,
			// then translate its result into effects.
			const result = await notebook.dispatchCommand(`${verb} ${rest}`.trim());
			return commandResultToEffects(result);
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
						break;
					}
					case "router.open": {
						const route = effect.route === "search" ? "help" : effect.route;
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
