import type {
	EditorOperation,
	EditorOperationResult,
} from "@stateful-mcp/macro-protocol";
import type { Session } from "../host-session/session-types";

type ResourceOperation = Extract<
	EditorOperation,
	{
		operation:
			| "editor.openScratchpad"
			| "editor.openResource"
			| "editor.resourceAction"
			| "editor.saveArtifact"
			| "editor.deleteScratchpad";
	}
>;

export function isResourceOperation(
	operation: EditorOperation,
): operation is ResourceOperation {
	return (
		operation.operation === "editor.openScratchpad" ||
		operation.operation === "editor.openResource" ||
		operation.operation === "editor.resourceAction" ||
		operation.operation === "editor.saveArtifact" ||
		operation.operation === "editor.deleteScratchpad"
	);
}

export async function executeResourceOperation(
	session: Session,
	operation: ResourceOperation,
	context: {
		readonly base: () => Record<string, unknown>;
		readonly workspaceConflict: (expected: number) => EditorOperationResult;
		readonly reject: (code: string, message: string) => EditorOperationResult;
		readonly emit: (type?: "workspace.changed") => void;
		readonly openScratchpad: (
			id: string,
			groupId?: string,
		) => Promise<
			{ readonly documentId: string; readonly textRevision: number } | undefined
		>;
		readonly getArtifact: (
			token: string,
		) => { readonly lifecycle?: string } | undefined;
	},
): Promise<EditorOperationResult> {
	if (operation.operation === "editor.saveArtifact") {
		const artifact = context.getArtifact(operation.artifactToken);
		if (!artifact)
			return context.reject(
				"ARTIFACT_NOT_FOUND",
				"Artifact is unavailable or expired",
			);
		if (artifact.lifecycle !== "project")
			return context.reject(
				"ARTIFACT_NOT_SAVEABLE",
				"This artifact cannot be saved to the project",
			);
		return context.reject(
			"ARTIFACT_MATERIALIZATION_UNAVAILABLE",
			"Project artifact materialization is not available yet",
		);
	}
	if (operation.operation === "editor.resourceAction") {
		if (
			operation.expectedWorkspaceRevision !== undefined &&
			operation.expectedWorkspaceRevision !== session.revision
		)
			return context.workspaceConflict(operation.expectedWorkspaceRevision);
		const provider = session.loaded.workspace.resources.get(
			operation.resourceKind,
		);
		if (
			!provider?.provider.executeAction ||
			!provider.capabilities?.includes("invoke")
		)
			return context.reject(
				"RESOURCE_ACTION_UNSUPPORTED",
				"This resource action is not available",
			);
		await provider.provider.executeAction(
			operation.action,
			operation.resourceId,
			operation.args ?? [],
		);
		context.emit();
		return {
			...context.base(),
			status: "accepted",
		} as unknown as EditorOperationResult;
	}
	if (operation.operation === "editor.deleteScratchpad") {
		await session.loaded.project?.deleteScratchpad(operation.scratchpadId);
		context.emit();
		return {
			...context.base(),
			status: "accepted",
		} as unknown as EditorOperationResult;
	}
	const id =
		operation.operation === "editor.openScratchpad"
			? operation.scratchpadId
			: operation.resourceId;
	if (
		operation.operation === "editor.openResource" &&
		operation.resourceKind !== "scratchpad"
	)
		return context.reject(
			"RESOURCE_KIND_UNSUPPORTED",
			"This resource kind cannot be opened by the editor",
		);
	const opened = await context.openScratchpad(
		id,
		"groupId" in operation ? operation.groupId : undefined,
	);
	if (!opened)
		return context.reject("RESOURCE_NOT_FOUND", "Saved resource not found");
	context.emit();
	return {
		...context.base(),
		status: "accepted",
		documentId: opened.documentId,
		textRevision: opened.textRevision,
	} as unknown as EditorOperationResult;
}
