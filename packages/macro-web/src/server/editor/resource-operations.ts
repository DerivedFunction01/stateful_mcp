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
		) => { readonly lifecycle?: string; readonly owner?: string } | undefined;
		readonly sessionOwner?: string;
		readonly isResourceExposed?: (kind: string, resourceId: string) => boolean;
		readonly materializeArtifact?: (
			token: string,
		) => Promise<{ readonly resourceId: string }>;
	},
): Promise<EditorOperationResult> {
	if (operation.operation === "editor.saveArtifact") {
		const artifact = context.getArtifact(operation.artifactToken);
		if (!artifact)
			return context.reject("ARTIFACT_NOT_FOUND", "artifact.unavailable");
		if (artifact.owner !== undefined && artifact.owner !== context.sessionOwner)
			return context.reject("ARTIFACT_UNAUTHORIZED", "artifact.unauthorized");
		if (artifact.lifecycle !== "project")
			return context.reject("ARTIFACT_NOT_SAVEABLE", "artifact.notSaveable");
		if (!context.materializeArtifact)
			return context.reject(
				"ARTIFACT_MATERIALIZATION_UNAVAILABLE",
				"artifact.materializationUnavailable",
			);
		const saved = await context.materializeArtifact(operation.artifactToken);
		context.emit();
		return {
			...context.base(),
			status: "accepted",
			resourceId: saved.resourceId,
		} as unknown as EditorOperationResult;
	}
	if (operation.operation === "editor.resourceAction") {
		if (
			operation.expectedWorkspaceRevision !== undefined &&
			operation.expectedWorkspaceRevision !== session.revision
		)
			return context.workspaceConflict(operation.expectedWorkspaceRevision);
		if (
			!context.isResourceExposed?.(operation.resourceKind, operation.resourceId)
		)
			return context.reject("RESOURCE_NOT_FOUND", "resource.notExposed");
		const provider = session.loaded.workspace.resources.get(
			operation.resourceKind,
		);
		if (
			!provider?.provider.executeAction ||
			!provider.capabilities?.includes("invoke")
		)
			return context.reject(
				"RESOURCE_ACTION_UNSUPPORTED",
				"resource.actionUnsupported",
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
			"resource.kindUnsupported",
		);
	if (
		operation.operation === "editor.openResource" &&
		!context.isResourceExposed?.(operation.resourceKind, operation.resourceId)
	)
		return context.reject("RESOURCE_NOT_FOUND", "resource.notExposed");
	const opened = await context.openScratchpad(
		id,
		"groupId" in operation ? operation.groupId : undefined,
	);
	if (!opened) return context.reject("RESOURCE_NOT_FOUND", "resource.notFound");
	context.emit();
	return {
		...context.base(),
		status: "accepted",
		documentId: opened.documentId,
		textRevision: opened.textRevision,
	} as unknown as EditorOperationResult;
}
