import type { CellCollectionRef } from "@stateful-mcp/clinical/session/cell";
import { segmentCellInput } from "@stateful-mcp/clinical/session/cell-input-segmentation";
import type { WorkspaceSnapshot } from "@stateful-mcp/clinical/session/workspace-read-model";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CellSubmissionPlan, CommandCatalog } from "../lib/cell-editor";
import { WorkspaceCommandCatalog } from "../lib/workspace-editor";
import type { SessionState } from "./useSession";

interface UseWorkspaceArgs {
	showWorkspace: boolean;
	sessionId: string;
	soapNoteId: string;
	/** The shared session; avoids re-bootstrapping a second engine instance. */
	session: SessionState | null;
}

interface UseWorkspaceReturn {
	snapshot: WorkspaceSnapshot | null;
	loading: boolean;
	error: string | null;
	complete: (winningBranchId: string) => Promise<void>;
	close: () => Promise<void>;
	addBranch: (branchName: string, conceptText: string) => Promise<void>;
	focused: boolean;
	toggleFocus: () => void;
	resetWorkspace: () => void;
	commandCatalog: CommandCatalog;
	focusBranch: (branchRef: string) => Promise<void>;
	planSubmission: (text: string) => CellSubmissionPlan;
	submitPlan: (plan: CellSubmissionPlan) => Promise<void>;
}

export function useWorkspace({
	showWorkspace,
	sessionId,
	soapNoteId,
	session,
}: UseWorkspaceArgs): UseWorkspaceReturn {
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

	const close = useCallback(async () => {
		setError(null);
		try {
			const engine = session?.result.engine;
			if (!engine) throw new Error("No engine available");
			if (!workspaceIdRef.current) return;
			await engine.closeAssessmentWorkspace(
				sessionId,
				workspaceIdRef.current,
			);
			await refresh();
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		}
	}, [session, sessionId, refresh]);

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

	const commandCatalog = useMemo<CommandCatalog>(() => {
		const profile = session?.result.engine.getParser().getProfile();
		return new WorkspaceCommandCatalog(profile ?? ({} as any), snapshot);
	}, [session, snapshot]);

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

	const getCollection = useCallback(
		(): CellCollectionRef => ({
			kind: "workspace",
			collectionId: workspaceIdRef.current ?? "",
		}),
		[],
	);

	const planSubmission = useCallback(
		(text: string): CellSubmissionPlan => {
			const profile = session?.result.engine.getParser().getProfile();
			const mappings = profile?.workspaceCommandMappings ?? {};
			const workspaceVerbs = new Set([
				...Object.keys(mappings),
				...Object.values(mappings),
			]);
			const directives = new Set(["target", "mode", "link", "parent"]);
			const variableOperations = new Set(["var"]);
			const ui = new Set(["help", "back", "exit", "focus", "status"]);
			const collection = getCollection();
			const segments = segmentCellInput(text, profile ?? ({} as any), {
				isUiCommand: (verb) => ui.has(verb),
				isVariableCommand: (verb) => variableOperations.has(verb),
				isWorkspaceCommand: (verb) => workspaceVerbs.has(verb),
				isCellConfiguration: (verb) => directives.has(verb),
			});
			return {
				submissionId: crypto.randomUUID(),
				collection,
				segments: segments.map((segment) => ({
					...segment,
					intentKind: segment.intentKind,
				})),
			};
		},
		[session, getCollection],
	);

	const submitPlan = useCallback(
		async (plan: CellSubmissionPlan) => {
			const engine = session?.result.engine;
			if (!engine || !workspaceIdRef.current) return;
			const branchId =
				snapshot?.activeBranchId ?? snapshot?.branches[0]?.branchId;
			for (const segment of plan.segments) {
				if (segment.kind === "ui_command") continue;
				if (segment.kind === "variable_command") {
					await engine.executeVariableCell(
						sessionId,
						plan.collection,
						segment.text,
						{
							kind: "workspace",
							id: plan.collection.collectionId,
						},
					);
					continue;
				}
				const created = await engine.createWorkspaceCell(
					sessionId,
					workspaceIdRef.current,
					segment.text,
					{
						branchId,
						routingScope: branchId ? "branch_local" : "global",
					},
				);
				await engine.executeWorkspaceCell(
					sessionId,
					workspaceIdRef.current,
					created.cellId,
				);
			}
			await refresh();
		},
		[session, sessionId, snapshot, refresh],
	);

	return {
		snapshot,
		loading,
		error,
		complete,
		close,
		addBranch,
		focused,
		toggleFocus,
		resetWorkspace,
		commandCatalog,
		focusBranch,
		planSubmission,
		submitPlan,
	};
}
