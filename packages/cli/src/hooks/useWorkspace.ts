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
			setSnapshot(null);
			workspaceIdRef.current = null;
			initializedRef.current = false;
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
	}, [session, sessionId]);

	const processInput = useCallback(
		async (workspaceId: string, branchId: string, text: string) => {
			setError(null);
			try {
				const engine = session?.result.engine;
				if (!engine) throw new Error("No engine available");
				await engine.processWorkspaceDictation(
					sessionId,
					workspaceId,
					branchId,
					text,
				);
				await refresh();
			} catch (err) {
				setError(err instanceof Error ? err.message : String(err));
			}
		},
		[session, sessionId, refresh],
	);

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
				setSnapshot(null);
				workspaceIdRef.current = null;
				initializedRef.current = false;
			} catch (err) {
				setError(err instanceof Error ? err.message : String(err));
			}
		},
		[session, sessionId],
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

	return {
		snapshot,
		loading,
		error,
		processInput,
		complete,
		addBranch,
		focused,
		toggleFocus,
	};
}
