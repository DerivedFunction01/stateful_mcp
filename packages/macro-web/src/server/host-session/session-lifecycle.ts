import { randomUUID } from "node:crypto";
import { type FSWatcher, watch } from "node:fs";
import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import {
	auditKeymapAndLogDiagnostics,
	DEFAULT_EDITOR_KEYMAP_PROFILE,
	mergeEditorKeymap,
} from "@stateful-mcp/macro";
import {
	createMacroProject,
	getProjectFileTree,
} from "@stateful-mcp/macro-host";
import type { WorkspaceSnapshot } from "@stateful-mcp/macro-protocol";
import type {
	HostSessionOptions,
	Session,
	SessionDisposalController,
	SessionLifecycleContext,
} from "./session-types";

const IGNORED_TREE_SEGMENTS = [".macro", ".macro-user", ".git"];

/**
 * Create a brand-new session: load a workspace via the host, merge the keymap,
 * register it, attach signal sources, and start file-tree watching. Returns the
 * session and its initial workspace snapshot.
 */
export async function createSession(
	ctx: SessionLifecycleContext,
	options: HostSessionOptions = {},
): Promise<{
	readonly session: Session;
	readonly snapshot: WorkspaceSnapshot;
}> {
	const loaded = await ctx.host.createWorkspace({
		...(ctx.projectRoot ? { projectRoot: ctx.projectRoot } : {}),
		...(options.profileId === undefined
			? {}
			: { profileId: options.profileId }),
		...(options.locale === undefined ? {} : { locale: options.locale }),
		...(options.initialText === undefined
			? {}
			: { initialText: options.initialText }),
		...(options.templates === undefined
			? {}
			: { templates: options.templates }),
	});
	const id = randomUUID();
	const mergedKeymap = mergeEditorKeymap(
		DEFAULT_EDITOR_KEYMAP_PROFILE,
		options.keymap,
	);
	auditKeymapAndLogDiagnostics(mergedKeymap);
	const session: Session = {
		id,
		workspaceId: randomUUID(),
		loaded,
		keymap: mergedKeymap,
		listeners: new Set(),
		unsubs: [],
		sequence: 0,
		revision: 0,
		lastActivity: Date.now(),
		disposed: false,
	};
	ctx.registry.register(session);
	ctx.eventBus.attachSignals(session);
	startFileTreeWatcher(ctx, session);
	return { session, snapshot: ctx.snapshotProvider(session) };
}

/**
 * Swap the session's workspace for the one rooted at `projectRoot`: cancel
 * existing signals/watchers, dispose the old workspace, load the new one, and
 * re-broadcast `workspace.changed`.
 */
export async function openProject(
	ctx: SessionLifecycleContext,
	sessionId: string,
	projectRoot: string,
): Promise<WorkspaceSnapshot> {
	const session = ctx.registry.getOrError(sessionId);
	for (const unsub of session.unsubs) unsub();
	session.unsubs.length = 0;
	stopFileTreeWatcher(session);
	await session.loaded.workspace.dispose();

	const loaded = await ctx.host.createWorkspace({
		projectRoot: resolve(projectRoot),
	});
	session.loaded = loaded;
	ctx.eventBus.attachSignals(session);
	startFileTreeWatcher(ctx, session);
	ctx.eventBus.emit(session, "workspace.changed");
	return ctx.snapshotProvider(session);
}

/**
 * Materialize a macro project on disk at `projectRoot` and then open it.
 */
export async function initProject(
	ctx: SessionLifecycleContext,
	sessionId: string,
	projectRoot: string,
	displayName?: string,
): Promise<WorkspaceSnapshot> {
	const rootPath = resolve(projectRoot);
	await createMacroProject({ rootPath, displayName });
	return openProject(ctx, sessionId, rootPath);
}

/** Build the disposal controller used by the registry from a context. */
export function createDisposalController(): SessionDisposalController {
	return {
		teardown(session: Session): void {
			stopFileTreeWatcher(session);
			for (const unsubscribe of session.unsubs) unsubscribe();
			session.listeners.clear();
		},
		async disposeResources(session: Session): Promise<void> {
			await session.loaded.workspace.dispose();
		},
	};
}

/**
 * Capture the current project file tree and broadcast
 * `project.fileTree.changed`. Failures are swallowed, matching the original
 * fire-and-forget behavior.
 */
function emitFileTreeChanged(
	ctx: SessionLifecycleContext,
	session: Session,
): void {
	void getProjectFileTree(ctx.projectRootResolver(session))
		.then((tree) =>
			ctx.eventBus.emit(session, "project.fileTree.changed", undefined, {
				tree,
			}),
		)
		.catch(() => undefined);
}

/** (Re)start recursive file-tree watching for `session`'s project root. */
export function startFileTreeWatcher(
	ctx: SessionLifecycleContext,
	session: Session,
): void {
	stopFileTreeWatcher(session);
	const root = session.loaded.project?.rootPath;
	if (!root) return;
	const onChange = (_event: string, filename: string | Buffer | null): void => {
		const changedPath = filename?.toString().replaceAll("\\", "/") ?? "";
		if (
			changedPath
				.split("/")
				.some((part) => IGNORED_TREE_SEGMENTS.includes(part))
		)
			return;
		if (session.fileTreeRefreshTimer)
			clearTimeout(session.fileTreeRefreshTimer);
		session.fileTreeRefreshTimer = setTimeout(() => {
			session.fileTreeRefreshTimer = undefined;
			emitFileTreeChanged(ctx, session);
			startFileTreeWatcher(ctx, session);
		}, 100);
	};
	void watchProjectDirectories(ctx, session, root, onChange);
}

/** Recursively watch every directory under `root`, ignoring VCS/macro dirs. */
async function watchProjectDirectories(
	ctx: SessionLifecycleContext,
	session: Session,
	root: string,
	onChange: (event: string, filename: string | Buffer | null) => void,
): Promise<void> {
	const watchers: FSWatcher[] = [];
	const visit = async (directory: string): Promise<void> => {
		let entries;
		try {
			entries = await readdir(directory, { withFileTypes: true });
		} catch {
			return;
		}
		try {
			watchers.push(watch(directory, onChange));
		} catch {
			return;
		}
		for (const entry of entries) {
			if (entry.isDirectory() && !IGNORED_TREE_SEGMENTS.includes(entry.name))
				await visit(resolve(directory, entry.name));
		}
	};
	await visit(root);
	if (session.disposed) {
		for (const watcher of watchers) watcher.close();
	} else {
		session.fileTreeWatchers = watchers;
	}
}

/** Stop all file-tree watching for `session` and clear the debounce timer. */
export function stopFileTreeWatcher(session: Session): void {
	if (session.fileTreeRefreshTimer) clearTimeout(session.fileTreeRefreshTimer);
	session.fileTreeRefreshTimer = undefined;
	session.fileTreeWatcher?.close();
	session.fileTreeWatcher = undefined;
	for (const watcher of session.fileTreeWatchers ?? []) watcher.close();
	session.fileTreeWatchers = undefined;
}
