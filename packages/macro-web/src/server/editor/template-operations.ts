import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { MacroDocumentTemplate } from "@stateful-mcp/macro";
import type {
	EditorOperation,
	EditorOperationResult,
} from "@stateful-mcp/macro-protocol";
import type { Session } from "../host-session/session-types";

type TemplateOperation = Extract<
	EditorOperation,
	{
		operation:
			| "editor.saveTemplate"
			| "editor.deleteTemplate"
			| "editor.openTemplateAsDocument"
			| "editor.updateTemplateLiteralArgs";
	}
>;
export function isTemplateOperation(
	operation: EditorOperation,
): operation is TemplateOperation {
	return (
		operation.operation.startsWith("editor.") &&
		[
			"editor.saveTemplate",
			"editor.deleteTemplate",
			"editor.openTemplateAsDocument",
			"editor.updateTemplateLiteralArgs",
		].includes(operation.operation)
	);
}
export async function executeTemplateOperation(
	session: Session,
	operation: TemplateOperation,
	context: {
		readonly base: () => Record<string, unknown>;
		readonly reject: (code: string, message: string) => EditorOperationResult;
		readonly emit: () => void;
		readonly userRoot: string;
	},
): Promise<EditorOperationResult> {
	const workspace = session.loaded.workspace;
	const documents = workspace.documents;
	if (operation.operation === "editor.openTemplateAsDocument") {
		const document = documents.openTemplateForEditing(operation.templateId);
		const groupId =
			operation.groupId && workspace.editorGroups.get(operation.groupId)
				? operation.groupId
				: workspace.editorGroups.getActiveGroupId();
		if (groupId)
			workspace.editorGroups.moveDocument(document.documentId, groupId);
		documents.select(document.documentId);
		context.emit();
		return {
			...context.base(),
			status: "accepted",
			documentId: document.documentId,
			textRevision: document.textRevision,
		} as unknown as EditorOperationResult;
	}
	if (operation.operation === "editor.deleteTemplate") {
		const existing = documents
			.getTemplates()
			.find((item) => item.templateId === operation.templateId);
		if (existing?.source === "extension" || existing?.isReadonly)
			return context.reject(
				"EDITOR_TEMPLATE_READONLY",
				"editor.template.readOnly",
			);
		await persistTemplates(
			session,
			documents
				.getTemplates()
				.filter((item) => item.templateId !== operation.templateId),
			operation.scope,
			context.userRoot,
		);
		documents.deleteTemplate(operation.templateId);
		context.emit();
		return {
			...context.base(),
			status: "accepted",
		} as unknown as EditorOperationResult;
	}
	const templateId =
		operation.operation === "editor.saveTemplate"
			? operation.template.templateId
			: "templateId" in operation
				? operation.templateId
				: "";
	const existing = documents
		.getTemplates()
		.find((item) => item.templateId === templateId);
	if (operation.operation === "editor.saveTemplate") {
		if (
			operation.template.source === "extension" ||
			operation.template.isReadonly
		)
			return context.reject(
				"EDITOR_TEMPLATE_READONLY",
				"editor.template.readOnly",
			);
		const template: MacroDocumentTemplate = {
			...operation.template,
			source: operation.scope,
		};
		await persistTemplates(
			session,
			[
				...documents
					.getTemplates()
					.filter((item) => item.templateId !== template.templateId),
				template,
			],
			operation.scope,
			context.userRoot,
		);
		documents.saveTemplate(template);
		context.emit();
		return {
			...context.base(),
			status: "accepted",
		} as unknown as EditorOperationResult;
	}
	if (!existing)
		return context.reject(
			"EDITOR_TEMPLATE_NOT_FOUND",
			"editor.template.notFound",
		);
	if (existing.source === "extension" || existing.isReadonly)
		return context.reject(
			"EDITOR_TEMPLATE_READONLY",
			"editor.template.readOnly",
		);
	const template = { ...existing, templateLiteralArgs: operation.literalArgs };
	await persistTemplates(
		session,
		[
			...documents
				.getTemplates()
				.filter((item) => item.templateId !== template.templateId),
			template,
		],
		operation.scope,
		context.userRoot,
	);
	documents.saveTemplate(template);
	context.emit();
	return {
		...context.base(),
		status: "accepted",
	} as unknown as EditorOperationResult;
}
async function persistTemplates(
	session: Session,
	templates: readonly MacroDocumentTemplate[],
	scope: "project" | "user",
	userRoot: string,
): Promise<void> {
	if (scope === "project") {
		const project = session.loaded.project;
		if (!project) throw new Error("A project workspace is required");
		await project.saveManifest(
			{ ...project.manifest, templates },
			project.descriptor.revision,
		);
		return;
	}
	const path = resolve(userRoot, ".macro-user", "templates.json");
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, JSON.stringify(templates, null, 2), "utf8");
}
