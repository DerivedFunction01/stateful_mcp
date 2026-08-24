import type { ExtensionRuntime } from "../../extensions/runtime";
import {
	ScratchpadSession,
	type ScratchpadSessionOptions,
} from "../scratchpad/scratchpad-session";
import { deduplicateTags, matchesTag } from "../tags/unicode-tag-resolver";
import { EditorKernel } from "./editor-kernel";

export const MACRO_TEXT_DOCUMENT_PROVIDER = "macro.text" as const;
export const MACRO_TEMPLATE_PROVIDER = "macro.template" as const;
export type MacroDocumentProviderKind =
	| typeof MACRO_TEXT_DOCUMENT_PROVIDER
	| typeof MACRO_TEMPLATE_PROVIDER
	| "file"
	| "scratchpad";

export interface MacroDocumentTemplate {
	readonly templateId: string;
	readonly title: string;
	readonly description?: string;
	readonly tags?: readonly string[];
	readonly source?: "extension" | "project" | "user";
	readonly isReadonly?: boolean;
	readonly pinnedMacroIds?: readonly string[];
	readonly sourceExtensionId?: string;
	readonly requiresProfile?: boolean;
	readonly initialText?: string;
	readonly createText?: (runtime: ExtensionRuntime) => string;
	/**
	 * Encoded as `"<macroName>/<argKey>"` (e.g. `"patient/dept"`).
	 * Arguments listed here are fixed literal constants; all others are placeholders.
	 */
	readonly templateLiteralArgs?: readonly string[];
}

export interface MacroDocument {
	readonly documentId: string;
	providerId: MacroDocumentProviderKind;
	filePath?: string;
	readonly editor: EditorKernel;
	readonly session: ScratchpadSession;
	readonly templateId?: string;
	pinnedMacroIds: readonly string[];
	title: string;
	dirty: boolean;
	textRevision: number;
	savedTextRevision: number;
	savedLines?: readonly string[];
	lastDiskMtime?: number;
	lastDiskHash?: string;
}

export interface MacroDocumentManagerOptions {
	readonly initialText?: string;
	readonly defaultTitle?: string;
	readonly scratchpad?: ScratchpadSessionOptions;
	readonly templates?: readonly MacroDocumentTemplate[];
}

export interface ReplaceDocumentTextRequest {
	readonly documentId: string;
	readonly lines: readonly string[];
	readonly expectedTextRevision: number;
}

export class MacroDocumentManager {
	private readonly documents = new Map<string, MacroDocument>();
	private readonly documentUnsubs = new Map<string, () => void>();
	private readonly listeners = new Set<() => void>();
	private templates: MacroDocumentTemplate[];
	private readonly scratchpadOptions: ScratchpadSessionOptions;
	private readonly defaultTitle: string;
	private activeDocumentId: string | null = null;

	constructor(
		private readonly runtime: ExtensionRuntime,
		options: MacroDocumentManagerOptions = {},
	) {
		this.templates = [...(options.templates ?? [])];
		this.scratchpadOptions = options.scratchpad ?? {};
		this.defaultTitle = options.defaultTitle ?? "";
		this.createDocument({
			initialText: options.initialText ?? "",
			title: this.defaultTitle,
		});
	}

	list(): readonly MacroDocument[] {
		return [...this.documents.values()];
	}

	get(documentId: string): MacroDocument | undefined {
		return this.documents.get(documentId);
	}

	active(): MacroDocument | undefined {
		return this.activeDocumentId
			? this.documents.get(this.activeDocumentId)
			: undefined;
	}

	getActiveDocumentId(): string | null {
		return this.activeDocumentId;
	}

	assertTextRevision(
		documentId: string,
		expectedTextRevision: number,
	): MacroDocument {
		const document = this.require(documentId);
		if (document.textRevision !== expectedTextRevision)
			throw new DocumentRevisionError(
				expectedTextRevision,
				document.textRevision,
			);
		return document;
	}

	getTemplates(): readonly MacroDocumentTemplate[] {
		return this.templates;
	}

	findTemplatesByTags(
		tags: readonly string[],
	): readonly MacroDocumentTemplate[] {
		if (tags.length === 0) return this.templates;
		return this.templates.filter((template) =>
			tags.every((queryTag) =>
				(template.tags ?? []).some((targetTag) =>
					matchesTag(queryTag, targetTag),
				),
			),
		);
	}

	saveTemplate(template: MacroDocumentTemplate): void {
		// Normalize tags to canonical NFC form before storage.
		const normalized: MacroDocumentTemplate = template.tags
			? { ...template, tags: deduplicateTags(template.tags) }
			: template;
		this.templates = [
			...this.templates.filter(
				(item) => item.templateId !== normalized.templateId,
			),
			normalized,
		];
		this.notify();
	}

	deleteTemplate(templateId: string): void {
		this.templates = this.templates.filter(
			(item) => item.templateId !== templateId,
		);
		this.notify();
	}

	select(documentId: string): MacroDocument {
		const document = this.require(documentId);
		if (this.activeDocumentId !== documentId) {
			this.activeDocumentId = documentId;
			this.notify();
		}
		return document;
	}

	createBlank(title = this.defaultTitle): MacroDocument {
		return this.createDocument({ initialText: "", title });
	}

	createFromTemplate(templateId: string): MacroDocument {
		const template = this.templates.find(
			(item) => item.templateId === templateId,
		);
		if (!template)
			throw new DocumentManagerError(
				"EDITOR_TEMPLATE_NOT_FOUND",
				"The selected document template is unavailable",
			);
		const liveTemplate = this.list().find(
			(item) =>
				item.providerId === MACRO_TEMPLATE_PROVIDER &&
				item.templateId === templateId,
		);
		const authoredText = liveTemplate
			? liveTemplate.editor.getLines().join("\n")
			: template.initialText;
		for (const macroId of template.pinnedMacroIds ?? []) {
			const available = this.runtime.adapters
				.list()
				.some(
					(item) =>
						item.adapter.definition.id === macroId ||
						item.adapter.definition.name === macroId,
				);
			if (!available)
				throw new DocumentManagerError(
					"EDITOR_TEMPLATE_SEED_UNAVAILABLE",
					"A configured template macro is unavailable",
				);
		}
		const document = this.createDocument({
			initialText: template.createText?.(this.runtime) ?? authoredText ?? "",
			title: template.title,
			templateId: template.templateId,
			pinnedMacroIds: template.pinnedMacroIds,
		});
		for (const macroId of template.pinnedMacroIds ?? []) {
			document.session.setPinnedMacro(macroId);
			const lastLine = document.editor.getLineCount() - 1;
			document.editor.setCursor(
				lastLine,
				document.editor.getLine(lastLine).length,
			);
			document.session.createPinnedMacroLine();
		}
		// Template seeding is part of document creation, not a user edit.
		document.savedLines = [...document.editor.getLines()];
		document.savedTextRevision = document.textRevision;
		document.dirty = false;
		return document;
	}

	/**
	 * Open a template as a live, editable "template document" in the editor canvas.
	 *
	 * Unlike `createFromTemplate` (which produces a user scratchpad), this method
	 * opens the template itself for authoring: changes can be saved back to the
	 * template definition via `editor.save`.
	 *
	 * If a document already exists for this templateId with `providerId === "macro.template"`,
	 * it is selected and returned instead of creating a duplicate.
	 */
	openTemplateForEditing(templateId: string): MacroDocument {
		const template = this.templates.find(
			(item) => item.templateId === templateId,
		);
		if (!template)
			throw new DocumentManagerError(
				"EDITOR_TEMPLATE_NOT_FOUND",
				"The selected template is unavailable",
			);

		// Reuse an existing open editor session for this template.
		const existing = this.list().find(
			(d) =>
				d.templateId === templateId && d.providerId === MACRO_TEMPLATE_PROVIDER,
		);
		if (existing) {
			this.select(existing.documentId);
			return existing;
		}

		const document = this.createDocument({
			initialText: template.initialText ?? "",
			title: template.title,
			templateId: template.templateId,
			pinnedMacroIds: template.pinnedMacroIds,
			providerId: MACRO_TEMPLATE_PROVIDER,
		});
		for (const macroId of template.pinnedMacroIds ?? []) {
			document.session.setPinnedMacro(macroId);
		}
		// Opening for editing is not a user edit — mark as clean from the start.
		document.savedLines = [...document.editor.getLines()];
		document.savedTextRevision = document.textRevision;
		document.dirty = false;
		return document;
	}

	close(documentId: string, force = false): MacroDocument | null {
		const document = this.require(documentId);
		if (document.dirty && !force)
			throw new DocumentManagerError(
				"EDITOR_DOCUMENT_DIRTY",
				"The document has unsaved changes",
			);

		this.documents.delete(documentId);
		this.documentUnsubs.get(documentId)?.();
		this.documentUnsubs.delete(documentId);
		if (this.activeDocumentId === documentId) {
			this.activeDocumentId = this.list()[0]?.documentId ?? null;
		}
		this.notify();
		return document;
	}

	rename(documentId: string, title: string): MacroDocument {
		const document = this.require(documentId);
		const normalized = title.trim();
		if (!normalized)
			throw new DocumentManagerError(
				"EDITOR_TITLE_REQUIRED",
				"Document title is required",
			);
		if (document.title !== normalized) {
			document.title = normalized;
			this.notify();
		}
		return document;
	}

	setPinnedMacro(documentId: string, macroId: string | null): MacroDocument {
		const document = this.require(documentId);
		const ids = macroId ? [macroId] : [];
		document.session.setPinnedMacro(macroId);
		document.pinnedMacroIds = ids;
		this.notify();
		return document;
	}

	replaceText(request: ReplaceDocumentTextRequest): MacroDocument {
		const document = this.require(request.documentId);
		if (document.textRevision !== request.expectedTextRevision)
			throw new DocumentRevisionError(
				request.expectedTextRevision,
				document.textRevision,
			);
		if (!sameLines(document.editor.getLines(), request.lines)) {
			document.editor.setLines(request.lines);
			document.textRevision += 1;
			if (
				document.providerId === MACRO_TEMPLATE_PROVIDER &&
				document.templateId
			) {
				const template = this.templates.find(
					(item) => item.templateId === document.templateId,
				);
				if (template) {
					this.templates = this.templates.map((item) =>
						item.templateId === document.templateId
							? { ...item, initialText: request.lines.join("\n") }
							: item,
					);
				}
			}
			const isClean = document.savedLines
				? sameLines(document.editor.getLines(), document.savedLines)
				: document.textRevision === document.savedTextRevision;
			document.dirty = !isClean;
			this.notify();
		}
		return document;
	}

	openScratchpadResource(resource: {
		scratchpadId: string;
		title: string;
		rawText: string;
		executedLineIndices?: readonly number[];
		pinnedMacroIds?: readonly string[];
	}): MacroDocument {
		const existing = this.list().find(
			(d) => d.documentId === resource.scratchpadId,
		);
		if (existing) {
			this.select(existing.documentId);
			return existing;
		}
		const document = this.createDocument({
			documentId: resource.scratchpadId,
			initialText: resource.rawText,
			title: resource.title,
			pinnedMacroIds: resource.pinnedMacroIds,
		});
		if (resource.executedLineIndices) {
			for (const lineIdx of resource.executedLineIndices) {
				document.session.markLineExecuted?.(lineIdx);
			}
		}
		for (const macroId of resource.pinnedMacroIds ?? []) {
			document.session.setPinnedMacro(macroId);
		}
		document.savedLines = [...document.editor.getLines()];
		document.savedTextRevision = document.textRevision;
		document.dirty = false;
		return document;
	}

	openFile(filePath: string, initialText = "", title?: string): MacroDocument {
		const existing = this.list().find((d) => d.filePath === filePath);
		if (existing) {
			this.select(existing.documentId);
			return existing;
		}
		const docTitle = title || filePath.split("/").pop() || "untitled";
		const document = this.createDocument({
			initialText,
			title: docTitle,
			providerId: "file",
			filePath,
		});
		return document;
	}

	saveAsFile(
		documentId: string,
		filePath: string,
		newTitle?: string,
	): MacroDocument {
		const document = this.require(documentId);
		document.providerId = "file";
		document.filePath = filePath;
		document.savedLines = [...document.editor.getLines()];
		document.savedTextRevision = document.textRevision;
		document.dirty = false;
		if (newTitle) {
			document.title = newTitle;
		} else {
			const fileName = filePath.split("/").pop();
			if (fileName) document.title = fileName;
		}
		this.notify();
		return document;
	}

	markClean(documentId: string): void {
		const document = this.require(documentId);
		document.savedLines = [...document.editor.getLines()];
		document.savedTextRevision = document.textRevision;
		if (document.dirty) {
			document.dirty = false;
			this.notify();
		}
	}

	markSaved(
		documentId: string,
		diskMtime?: number,
		diskHash?: string,
	): MacroDocument {
		const document = this.require(documentId);
		document.savedLines = [...document.editor.getLines()];
		document.savedTextRevision = document.textRevision;
		document.dirty = false;
		if (diskMtime !== undefined) document.lastDiskMtime = diskMtime;
		if (diskHash !== undefined) document.lastDiskHash = diskHash;
		this.notify();
		return document;
	}

	reloadDiskText(
		documentId: string,
		lines: readonly string[],
		diskMtime?: number,
		diskHash?: string,
	): MacroDocument {
		const document = this.require(documentId);
		document.editor.setLines(lines);
		document.textRevision += 1;
		document.savedLines = [...lines];
		document.savedTextRevision = document.textRevision;
		document.dirty = false;
		if (diskMtime !== undefined) document.lastDiskMtime = diskMtime;
		if (diskHash !== undefined) document.lastDiskHash = diskHash;
		this.notify();
		return document;
	}

	clearExecutedLines(documentId: string): MacroDocument {
		const document = this.require(documentId);
		document.session.clearExecutedLines();
		document.dirty = true;
		document.textRevision += 1;
		this.notify();
		return document;
	}

	resetExecutionState(documentId: string): MacroDocument {
		const document = this.require(documentId);
		document.session.resetExecutionState();
		this.notify();
		return document;
	}

	duplicateDocument(documentId: string, newTitle?: string): MacroDocument {
		const original = this.require(documentId);
		const title = newTitle || this.generateDuplicateTitle(original.title);
		const copy = this.createDocument({
			initialText: original.editor.getLines().join("\n"),
			title,
			pinnedMacroIds: original.pinnedMacroIds,
		});
		return copy;
	}

	private generateDuplicateTitle(originalTitle: string): string {
		const dotIdx = originalTitle.lastIndexOf(".");
		const hasExt = dotIdx > 0;
		const baseName = hasExt ? originalTitle.slice(0, dotIdx) : originalTitle;
		const ext = hasExt ? originalTitle.slice(dotIdx) : "";

		const rootMatch = baseName.match(/^(.*?)(?:\s*\((?:Copy\s*)?(\d+)?\))?$/i);
		const root = (rootMatch && rootMatch[1] ? rootMatch[1] : baseName).trim();

		const existingTitles = new Set(
			Array.from(this.documents.values()).map((d) => d.title.toLowerCase()),
		);

		let count = 1;
		let candidate = `${root} (${count})${ext}`;
		while (existingTitles.has(candidate.toLowerCase())) {
			count += 1;
			candidate = `${root} (${count})${ext}`;
		}
		return candidate;
	}

	dispose(): void {
		for (const unsubscribe of this.documentUnsubs.values()) unsubscribe();
		this.documentUnsubs.clear();
		this.documents.clear();
		this.activeDocumentId = null;
		this.notify();
	}

	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private createDocument(options: {
		readonly documentId?: string;
		readonly initialText: string;
		readonly title: string;
		readonly templateId?: string;
		readonly pinnedMacroIds?: readonly string[];
		readonly providerId?: MacroDocumentProviderKind;
		readonly filePath?: string;
	}): MacroDocument {
		const editor = new EditorKernel(options.initialText);
		const session = new ScratchpadSession(
			this.runtime,
			editor,
			50,
			this.scratchpadOptions,
		);
		const pinnedMacroIds = options.pinnedMacroIds ?? [];
		if (pinnedMacroIds[0]) session.setPinnedMacro(pinnedMacroIds[0]);
		const document: MacroDocument = {
			documentId: options.documentId ?? createDocumentId(),
			providerId: options.providerId ?? MACRO_TEXT_DOCUMENT_PROVIDER,
			...(options.filePath ? { filePath: options.filePath } : {}),
			editor,
			session,
			...(options.templateId ? { templateId: options.templateId } : {}),
			pinnedMacroIds,
			title: options.title,
			dirty: false,
			textRevision: 0,
			savedTextRevision: 0,
			savedLines: editor.getLines(),
		};
		const unsubscribe = editor.subscribe(() => {
			const isClean = document.savedLines
				? sameLines(document.editor.getLines(), document.savedLines)
				: document.textRevision === document.savedTextRevision;
			document.dirty = !isClean;
			this.notify();
		});
		this.documents.set(document.documentId, document);
		this.documentUnsubs.set(document.documentId, unsubscribe);
		this.activeDocumentId = document.documentId;
		this.notify();
		return document;
	}

	private require(documentId: string): MacroDocument {
		const document = this.documents.get(documentId);
		if (!document)
			throw new DocumentManagerError(
				"EDITOR_DOCUMENT_NOT_FOUND",
				`Document '${documentId}' was not found`,
			);
		return document;
	}

	private notify(): void {
		for (const listener of this.listeners) listener();
	}
}

function sameLines(left: readonly string[], right: readonly string[]): boolean {
	return (
		left.length === right.length &&
		left.every((line, index) => line === right[index])
	);
}

export class DocumentManagerError extends Error {
	constructor(
		readonly code: string,
		message: string,
	) {
		super(message);
		this.name = "DocumentManagerError";
	}
}

export class DocumentRevisionError extends DocumentManagerError {
	constructor(
		readonly expectedRevision: number,
		readonly actualRevision: number,
	) {
		super("EDITOR_REVISION_STALE", "The document revision is stale");
		this.name = "DocumentRevisionError";
	}
}

function createDocumentId(): string {
	return `macro-document-${crypto.randomUUID()}`;
}
