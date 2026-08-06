import type { WorkspaceSnapshot } from "@stateful-mcp/clinical/workspaces/workspace-snapshot";
import type { WorkspaceOperation } from "@stateful-mcp/clinical/workspaces/workspace-types";
import { useCallback, useEffect, useRef, useState } from "react";
import type { SessionState } from "./useSession";

interface UseWorkspaceArgs {
	showWorkspace: boolean;
	sessionId: string;
	soapNoteId: string;
	session: SessionState | null;
}

export function useWorkspace({
	showWorkspace,
	sessionId,
	soapNoteId,
	session,
}: UseWorkspaceArgs) {
	const [snapshot, setSnapshot] = useState<WorkspaceSnapshot | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [focused, setFocused] = useState(false);
	const workspaceIdRef = useRef<string | null>(null);
	const service = session?.v2.engine.getWorkspaceService();

	const refresh = useCallback(async () => {
		if (!service || !workspaceIdRef.current) return;
		setSnapshot(await service.getSnapshot(workspaceIdRef.current));
	}, [service]);

	useEffect(() => {
		if (!showWorkspace || !service) return;
		let cancelled = false;
		setLoading(true);
		(async () => {
			try {
				let workspace = (await service.listWorkspaces(sessionId))[0] ?? null;
				if (!workspace)
					workspace = await service.createWorkspace({
						sessionId,
						sourceDocumentId: soapNoteId,
						workspaceId: `workspace-${sessionId}`,
						initialBranches: [],
					});
				if (cancelled) return;
				workspaceIdRef.current = workspace.id;
				setSnapshot(await service.getSnapshot(workspace.id));
			} catch (cause) {
				if (!cancelled)
					setError(cause instanceof Error ? cause.message : String(cause));
			} finally {
				if (!cancelled) setLoading(false);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [service, sessionId, showWorkspace, soapNoteId]);

	const applyOperations = useCallback(
		async (operations: WorkspaceOperation[]) => {
			if (!service || !workspaceIdRef.current || operations.length === 0)
				return;
			const current = await service.getWorkspace(workspaceIdRef.current);
			if (!current) throw new Error(" workspace was not found");
			await service.applyOperations(
				current.id,
				operations,
				current.version,
				current.eventHead,
			);
			await refresh();
		},
		[refresh, service],
	);

	const apply = useCallback(
		async (operation: WorkspaceOperation) => {
			await applyOperations([operation]);
		},
		[applyOperations],
	);

	const complete = useCallback(
		async (winningBranchId: string) => {
			try {
				await apply({
					kind: "complete",
					workspaceId: workspaceIdRef.current!,
					winningBranchId,
				});
			} catch (cause) {
				setError(cause instanceof Error ? cause.message : String(cause));
			}
		},
		[apply],
	);
	const close = useCallback(async () => {
		try {
			await apply({ kind: "close", workspaceId: workspaceIdRef.current! });
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : String(cause));
		}
	}, [apply]);
	const addBranch = useCallback(
		async (name: string, conceptText: string) => {
			try {
				await apply({
					kind: "create_branch",
					workspaceId: workspaceIdRef.current!,
					name,
					concept: { conceptId: conceptText, display: conceptText },
				});
			} catch (cause) {
				setError(cause instanceof Error ? cause.message : String(cause));
			}
		},
		[apply],
	);
	const executeCommand = useCallback(
		async (rawText: string) => {
			if (!session || !workspaceIdRef.current) return;
			const result = await session.v2.commandBar.execute({
				rawText,
				sessionId,
				workspaceId: workspaceIdRef.current,
			});
			if (result.status !== "committed")
				setError(result.error ?? " workspace command failed");
			await refresh();
		},
		[refresh, session, sessionId],
	);

	return {
		snapshot,
		loading,
		error,
		focused,
		toggleFocus: () => setFocused((value) => !value),
		resetWorkspace: () => {
			workspaceIdRef.current = null;
			setSnapshot(null);
			setFocused(false);
		},
		complete,
		close,
		addBranch,
		applyOperations,
		executeCommand,
		focusBranch: async (branchRef: string) => {
			if (
				!snapshot?.branches.some(
					(branch) =>
						branch.branchId === branchRef ||
						branch.commandAlias === branchRef ||
						branch.name === branchRef,
				)
			)
				setError(`Branch '${branchRef}' was not found`);
		},
	};
}
