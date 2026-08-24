import type {
	EditorWorkspaceSnapshotDto,
	ScratchpadLineDto,
	ScratchpadTemplateDescriptor,
} from "@stateful-mcp/macro-protocol";
import type { Session } from "../host-session/session-types";
import {
	toEditorDocumentDto,
	toEditorDocumentSnapshot,
	toEditorOutput,
	toScratchpadLineDto,
} from "./editor-projections";

export function editorSnapshot(session: Session): EditorWorkspaceSnapshotDto {
	const documents = session.loaded.workspace.documents;
	const active = documents.active();
	const templates: ScratchpadTemplateDescriptor[] = documents
		.getTemplates()
		.map((template) => ({
			templateId: template.templateId,
			providerId: "macro.text",
			title: template.title,
			...(template.description ? { description: template.description } : {}),
			...(template.cellDefaults ? { cellDefaults: template.cellDefaults } : {}),
			...(template.sourceExtensionId
				? { sourceExtensionId: template.sourceExtensionId }
				: {}),
			...(template.requiresProfile ? { requiresProfile: true } : {}),
			...(template.initialText !== undefined
				? { initialText: template.initialText }
				: {}),
			...(template.tags ? { tags: template.tags } : {}),
			...(template.source ? { source: template.source } : {}),
			...(template.isReadonly ? { isReadonly: true } : {}),
		}));
	return {
		documents: documents.list().map(toEditorDocumentDto),
		groups: session.loaded.workspace.editorGroups.list().map((group) => ({
			groupId: group.groupId,
			documentIds: group.documentIds,
			activeDocumentId: group.activeDocumentId,
			orientation: group.orientation,
			...(group.sizeRatio === undefined ? {} : { sizeRatio: group.sizeRatio }),
		})),
		editorLayout: {
			version: 1,
			root: editorLayoutNodeDto(
				session.loaded.workspace.editorGroups.getLayoutRoot(),
				session.loaded.workspace.editorGroups,
			),
		},
		activeGroupId: session.loaded.workspace.editorGroups.getActiveGroupId(),
		activeDocumentId: documents.getActiveDocumentId(),
		activeDocument: active ? toEditorDocumentSnapshot(active) : null,
		loadedDocuments: Object.fromEntries(
			documents
				.list()
				.map((document) => [
					document.documentId,
					toEditorDocumentSnapshot(document),
				]),
		),
		templates,
		output: toEditorOutput(session.loaded.workspace.journal),
		capabilities: {
			canCreate: true,
			canExecute: Boolean(active),
			canPersist: true,
			canSplit: true,
			canUseVim: true,
		},
	};
}

export function editorLinesForOperation(
	document: import("@stateful-mcp/macro").MacroDocument,
	operation: {
		readonly operation: string;
		readonly lineNumber?: number;
		readonly startLine?: number;
		readonly endLine?: number;
	},
): readonly ScratchpadLineDto[] {
	const lines = document.session.getProjectedLines().map((line, idx) =>
		toScratchpadLineDto({
			...line,
			isExecuted: document.session.isLineExecuted(idx),
		}),
	);
	if (operation.operation === "editor.previewDocument") return lines;
	if (operation.operation === "editor.previewLine")
		return lines.filter((line) => line.lineNumber === operation.lineNumber);
	return lines.filter(
		(line) =>
			line.lineNumber >= operation.startLine! &&
			line.lineNumber <= operation.endLine!,
	);
}

function editorLayoutNodeDto(
	node: import("@stateful-mcp/macro").EditorLayoutNode,
	groups: import("@stateful-mcp/macro").MacroEditorGroupManager,
): import("@stateful-mcp/macro-protocol").EditorLayoutNodeDto {
	if (node.kind === "group") {
		const group = groups.get(node.groupId);
		return {
			kind: "group",
			groupId: node.groupId,
			documentIds: group?.documentIds ?? [],
			activeDocumentId: group?.activeDocumentId ?? null,
		};
	}
	return {
		kind: "split",
		nodeId: node.nodeId,
		orientation: node.orientation,
		children: node.children.map((child) => editorLayoutNodeDto(child, groups)),
	};
}
