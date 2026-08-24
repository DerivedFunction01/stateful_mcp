import type { ProjectResourceTreeNodeDto } from "@stateful-mcp/macro-protocol";
import type { Session } from "../host-session/session-types";

export function projectResourceTree(
	session: Session,
): readonly ProjectResourceTreeNodeDto[] {
	const project = session.loaded.project;
	if (!project) return [];
	const references = project.descriptor.scratchpadResources ?? [];
	const providerTrees = session.loaded.workspace.resources
		.project(references)
		.map(({ provider, items }) => ({
			nodeId: `provider:${provider.kind}`,
			nodeType: "folder" as const,
			label: provider.title,
			icon: provider.icon,
			children: items.map((item) => ({
				nodeId: `${provider.kind}:${item.resourceId}`,
				nodeType: "resource" as const,
				label: item.label,
				category: "resource" as const,
				scope: "project" as const,
				resourceKind: provider.kind,
				resourceId: item.resourceId,
				capabilities: provider.capabilities ?? [],
				metadata: item.metadata,
			})),
		}));
	if (providerTrees.length > 0) return providerTrees;
	const scratchpads = references.map((reference) => ({
		nodeId: `${reference.kind}:${reference.resourceId}`,
		nodeType: "resource" as const,
		label:
			typeof reference.metadata?.title === "string"
				? reference.metadata.title
				: reference.resourceId,
		category: "resource" as const,
		scope: "project" as const,
		resourceKind: reference.kind,
		resourceId: reference.resourceId,
		capabilities: ["open"] as const,
		metadata: reference.metadata,
		disabled: reference.kind !== "scratchpad",
		disabledReason:
			reference.kind !== "scratchpad"
				? "No resource provider is available"
				: undefined,
	}));
	if (scratchpads.length === 0) return [];
	return [
		{
			nodeId: "provider:scratchpad",
			nodeType: "folder",
			label: "Scratchpads",
			icon: "notebook",
			children: scratchpads,
		},
	];
}
