import type { WorkspaceSnapshot } from "@stateful-mcp/clinical/workspaces/workspace-snapshot";
import type { CommandSyntaxProfile } from "@stateful-mcp/clinical/commands/command-syntax-profile";
import { useMemo } from "react";
import type { WindowOverlayRoute } from "../editor/overlay";
import { commandResultToEffects } from "../windows/notebook/extension";
import { buildWorkspaceExtension } from "../windows/workspace/extension";
import { builtinExtensions } from "./builtin-extensions";

// TODO(cli2-v2): this copied runtime remains a disabled V1 help/command seam.
// Native Workspace uses WorkspaceService and  snapshots directly.
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

export interface WorkspaceRuntimeOptions {
	sessionId: string;
	profile: CommandSyntaxProfile | null;
	snapshot: WorkspaceSnapshot | null;
	/** Host-side execution of a workspace command line → result. */
	onCommand(line: string): Promise<{
		success: boolean;
		message?: string;
		action?: string;
		data?: unknown;
	}>;
	onCommandResultAccepted(): void;
	onAppQuit(): void;
	onOpenOverlay?(route: WindowOverlayRoute, payload?: unknown): void;
	onCloseOverlay?(): void;
	onSwitchWindow?(windowKind: string): void;
	onSubmittingChange?(submitting: boolean): void;
	onMessage?(message: string): void;
}

/**
 * Assembles the v2 workspace's extension runtime: registers built-in editor
 * descriptors plus the workspace profile (branch/variable) scoped to the
 * workspace window, and maps resulting effects onto the live workspace host.
 */
export function useWorkspaceRuntime(opts: WorkspaceRuntimeOptions): {
	runtime: WindowRuntime;
	dispatchCommandLine(line: string): Promise<void>;
	toIntent(line: string): WindowIntent | null;
} {
	const { sessionId, profile, snapshot } = opts;

	const scope: WindowScope = {
		windowKind: "workspace",
		sessionId,
		collection: {
			kind: "workspace",
			collectionId: snapshot?.workspaceId ?? sessionId,
		},
		activeBranchId: snapshot?.activeBranchId ?? undefined,
	};

	const onCommand = useMemo(
		() => async (intent: WindowIntent) => {
			const verb = (intent.arguments["_verb"] as string) ?? intent.id;
			const rest = (intent.arguments["_rest"] as string) ?? "";
			const result = await opts.onCommand(`${verb} ${rest}`.trim());
			return commandResultToEffects(result);
		},
		[opts],
	);

	const extensions = useMemo<EditorExtension[]>(() => {
		const editorDescriptors: any[] = [];
		return [
			...builtinExtensions,
			buildWorkspaceExtension({
				profile: profile ?? ({} as CommandSyntaxProfile),
				snapshot,
				editorDescriptors,
				onCommand,
			}),
		];
	}, [profile, snapshot, onCommand]);

	const applyEffects = useMemo(
		() => (effects: WindowEffect[]) => {
			let openedAny = false;
			for (const effect of effects) {
				switch (effect.type) {
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
		[opts],
	);

	const runtime = useMemo(
		() =>
			createWindowRuntime(
				{ kind: "workspace", extensions, scope, effectHandler: undefined },
				applyEffects,
			),
		[extensions, scope, applyEffects],
	);

	const dispatchCommandLine = async (line: string) => {
		opts.onSubmittingChange?.(true);
		try {
			const intent = runtime.catalog.toIntent(line, scope);
			if (intent) {
				await runIntent(runtime, intent, {
					scope,
					editorState: {},
					document: {},
					services: {},
				});
				return;
			}
			const result = await opts.onCommand(line.slice(1));
			if (result.action === "quit") opts.onAppQuit();
			else opts.onCommandResultAccepted();
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
