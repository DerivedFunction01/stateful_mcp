import type { CellCollectionRef } from "@stateful-mcp/clinical/session/cell";
import { segmentCellInput } from "@stateful-mcp/clinical/session/cell-input-segmentation";
import { VariableCommandProvider } from "@stateful-mcp/clinical/session/variable-command-provider";
import { WorkspaceCommandProvider } from "@stateful-mcp/clinical/session/workspace-command-provider";
import type { WorkspaceSnapshot } from "@stateful-mcp/clinical/session/workspace-read-model";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CellSubmissionPlan } from "../lib/cell-editor";
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
	complete: (winningBranchId: string) => Promise<void>;
	addBranch: (branchName: string, conceptText: string) => Promise<void>;
	focused: boolean;
	toggleFocus: () => void;
	resetWorkspace: () => void;
	getCommandSuggestions: (text: string) => string[];
	focusBranch: (branchRef: string) => Promise<void>;
	planSubmission: (text: string) => CellSubmissionPlan;
	submitPlan: (plan: CellSubmissionPlan) => Promise<void>;
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
			const variableProvider = new VariableCommandProvider();
			const body = text.trim().slice(1);
			const parts = body.split(/\s+/);
			const prefix = parts[parts.length - 1] ?? "";
			if (parts.length <= 1) {
				return provider
					.getDescriptors()
					.flatMap((descriptor) => [descriptor.verb, ...descriptor.aliases])
					.concat(
						variableProvider
							.getDescriptors()
							.map((descriptor) => descriptor.verb),
					)
					.filter((verb) => verb.startsWith(prefix));
			}
			if (parts[0] === "var") {
				return variableProvider.getOperationCompletions(prefix);
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
		addBranch,
		focused,
		toggleFocus,
		resetWorkspace,
		getCommandSuggestions,
		focusBranch,
		planSubmission,
		submitPlan,
	};
}
