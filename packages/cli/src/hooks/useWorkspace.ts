import { WorkspaceCommandProvider } from "@stateful-mcp/clinical/session/workspace-command-provider";
import type { WorkspaceSnapshot } from "@stateful-mcp/clinical/session/workspace-read-model";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "./useSession";

interface UseWorkspaceArgs {
	showWorkspace: boolean;
	sessionId: string;
	soapNoteId: string;
}

interface UseWorkspaceReturn {
	snapshot: WorkspaceSnapshot | null;
	loading: boolean;
	error: string | null;
	processInput: (
		workspaceId: string,
		branchId: string,
		text: string,
	) => Promise<void>;
	complete: (winningBranchId: string) => Promise<void>;
	addBranch: (branchName: string, conceptText: string) => Promise<void>;
	focused: boolean;
	toggleFocus: () => void;
	resetWorkspace: () => void;
	getCommandSuggestions: (text: string) => string[];
	focusBranch: (branchRef: string) => Promise<void>;
}

export function useWorkspace({
	showWorkspace,
	sessionId,
	soapNoteId,
}: UseWorkspaceArgs): UseWorkspaceReturn {
	const session = useSession();
	const [snapshot, setSnapshot] = useState<WorkspaceSnapshot | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [focused, setFocused] = useState(false);
	const workspaceIdRef = useRef<string | null>(null);
	const initializedRef = useRef(false);

	useEffect(() => {
		if (!showWorkspace) {
			// Keep the snapshot alive when the full workspace screen closes so the
			// context strip can keep rendering the active workspace in normal mode.
			// Only an explicit reset (complete/reset) clears it.
			setFocused(false);
			return;
		}
		if (initializedRef.current && workspaceIdRef.current) return;
		initializedRef.current = true;
		setLoading(true);
		setError(null);
		const engine = session?.result.engine;
		if (!engine) {
			setError("No engine available");
			setLoading(false);
			return;
		}
		engine
			.initAssessmentWorkspace(sessionId, soapNoteId, [])
			.then((workspaceId) => {
				workspaceIdRef.current = workspaceId;
				const readModel = engine.getWorkspaceReadModel();
				if (!readModel) throw new Error("No workspace read model");
				return readModel.getWorkspace(sessionId, workspaceId);
			})
			.then((ws) => {
				setSnapshot(ws);
				setLoading(false);
			})
			.catch((err) => {
				setError(err instanceof Error ? err.message : String(err));
				setLoading(false);
			});
	}, [showWorkspace, sessionId, soapNoteId, session]);

	const refresh = useCallback(async () => {
		if (!workspaceIdRef.current) return;
		const engine = session?.result.engine;
		if (!engine) return;
		const readModel = engine.getWorkspaceReadModel();
		if (!readModel) return;
		const ws = await readModel.getWorkspace(sessionId, workspaceIdRef.current);
		setSnapshot(ws);
		const cells = await engine.listWorkspaceCells(
			sessionId,
			workspaceIdRef.current,
		);
		await session.notebook.saveCollection(sessionId, {
			collection: { kind: "workspace", collectionId: workspaceIdRef.current },
			ordering: cells.map((cell) => cell.cellId),
			activeIndex: Math.max(0, cells.length - 1),
			draftText: "",
		});
	}, [session, sessionId]);

	const processInput = useCallback(
		async (workspaceId: string, branchId: string, text: string) => {
			setError(null);
			try {
				const engine = session?.result.engine;
				if (!engine) throw new Error("No engine available");
				const created = await engine.createWorkspaceCell(
					sessionId,
					workspaceId,
					text,
					{
						branchId,
						routingScope: "branch_local",
					},
				);
				await engine.executeWorkspaceCell(
					sessionId,
					workspaceId,
					created.cellId,
				);
				await refresh();
			} catch (err) {
				setError(err instanceof Error ? err.message : String(err));
			}
		},
		[session, sessionId, refresh],
	);

	const resetWorkspace = useCallback(() => {
		setSnapshot(null);
		workspaceIdRef.current = null;
		initializedRef.current = false;
		setFocused(false);
	}, []);

	const complete = useCallback(
		async (winningBranchId: string) => {
			setError(null);
			try {
				const engine = session?.result.engine;
				if (!engine) throw new Error("No engine available");
				if (!workspaceIdRef.current) return;
				await engine.completeAssessmentWorkspace(
					sessionId,
					workspaceIdRef.current,
					winningBranchId,
				);
				resetWorkspace();
			} catch (err) {
				setError(err instanceof Error ? err.message : String(err));
			}
		},
		[session, sessionId, resetWorkspace],
	);

	const addBranch = useCallback(
		async (branchName: string, conceptText: string) => {
			setError(null);
			try {
				const engine = session?.result.engine;
				if (!engine) throw new Error("No engine available");
				if (!workspaceIdRef.current) return;
				await engine.addAssessmentBranch(
					sessionId,
					workspaceIdRef.current,
					branchName,
					conceptText,
				);
				await refresh();
			} catch (err) {
				setError(err instanceof Error ? err.message : String(err));
			}
		},
		[session, sessionId, refresh],
	);

	const toggleFocus = useCallback(() => {
		setFocused((prev) => !prev);
	}, []);

	const getCommandSuggestions = useCallback(
		(text: string) => {
			const engine = session?.result.engine;
			if (!engine || !text.trim().startsWith(":")) return [];
			const provider = new WorkspaceCommandProvider(
				engine.getParser().getProfile(),
			);
			const body = text.trim().slice(1);
			const parts = body.split(/\s+/);
			const prefix = parts[parts.length - 1] ?? "";
			if (parts.length <= 1) {
				return provider
					.getDescriptors()
					.flatMap((descriptor) => [descriptor.verb, ...descriptor.aliases])
					.filter((verb) => verb.startsWith(prefix));
			}
			return provider
				.getArgumentCompletions(parts[0] ?? "", parts.length - 2, snapshot)
				.filter((value) => value.startsWith(prefix));
		},
		[session, snapshot],
	);

	const focusBranch = useCallback(
		async (branchRef: string) => {
			const engine = session?.result.engine;
			if (!engine || !workspaceIdRef.current) return;
			try {
				setError(null);
				await engine.focusWorkspaceBranch(
					sessionId,
					workspaceIdRef.current,
					branchRef,
				);
				await refresh();
			} catch (err) {
				setError(err instanceof Error ? err.message : String(err));
			}
		},
		[session, sessionId, refresh],
	);

	return {
		snapshot,
		loading,
		error,
		processInput,
		complete,
		addBranch,
		focused,
		toggleFocus,
		resetWorkspace,
		getCommandSuggestions,
		focusBranch,
	};
}
