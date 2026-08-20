import {
	DocumentManagerError,
	type MacroDocument,
	type MacroDocumentManager,
} from "./macro-document-manager";

export interface EditorGroup {
	readonly groupId: string;
	readonly documentIds: readonly string[];
	readonly activeDocumentId: string | null;
	readonly orientation: "horizontal" | "vertical";
	readonly sizeRatio?: number;
}

export interface CreateEditorGroupOptions {
	readonly sourceGroupId?: string;
	readonly documentId?: string;
	readonly orientation?: "horizontal" | "vertical";
}

export class MacroEditorGroupManager {
	private readonly groups = new Map<string, EditorGroup>();
	private readonly listeners = new Set<() => void>();
	private readonly documentUnsubscribe: () => void;
	private activeGroupId: string;
	private syncing = false;

	constructor(private readonly documents: MacroDocumentManager) {
		const initial = createGroupId();
		const activeDocumentId = documents.getActiveDocumentId();
		this.groups.set(initial, {
			groupId: initial,
			documentIds: activeDocumentId ? [activeDocumentId] : [],
			activeDocumentId,
			orientation: "horizontal",
		});
		this.activeGroupId = initial;
		this.documentUnsubscribe = documents.subscribe(() =>
			this.syncFromDocuments(),
		);
	}

	list(): readonly EditorGroup[] {
		return [...this.groups.values()];
	}

	getActiveGroupId(): string {
		return this.activeGroupId;
	}

	get(groupId: string): EditorGroup | undefined {
		return this.groups.get(groupId);
	}

	create(options: CreateEditorGroupOptions = {}): EditorGroup {
		const source = this.groups.get(options.sourceGroupId ?? this.activeGroupId);
		if (!source)
			throw new DocumentManagerError(
				"EDITOR_GROUP_NOT_FOUND",
				"Editor group not found",
			);
		const documentId = options.documentId ?? source.activeDocumentId;
		if (documentId) this.requireDocument(documentId);
		const group: EditorGroup = {
			groupId: createGroupId(),
			documentIds: documentId ? [documentId] : [],
			activeDocumentId: documentId,
			orientation: options.orientation ?? "vertical",
		};
		this.groups.set(group.groupId, group);
		this.activeGroupId = group.groupId;
		this.notify();
		return group;
	}

	close(groupId: string): EditorGroup {
		const group = this.requireGroup(groupId);
		if (this.groups.size <= 1)
			throw new DocumentManagerError(
				"EDITOR_LAST_GROUP",
				"At least one editor group must remain open",
			);
		const target = [...this.groups.values()].find(
			(item) => item.groupId !== groupId,
		);
		if (!target)
			throw new DocumentManagerError(
				"EDITOR_LAST_GROUP",
				"At least one editor group must remain open",
			);
		let nextTarget = target;
		for (const documentId of group.documentIds)
			nextTarget = this.withDocument(
				nextTarget,
				documentId,
				nextTarget.activeDocumentId ?? documentId,
			);
		this.groups.set(nextTarget.groupId, nextTarget);
		this.groups.delete(groupId);
		if (this.activeGroupId === groupId) this.activeGroupId = nextTarget.groupId;
		this.notify();
		return group;
	}

	focus(groupId: string): EditorGroup {
		const group = this.requireGroup(groupId);
		this.activeGroupId = groupId;
		if (group.activeDocumentId) this.documents.select(group.activeDocumentId);
		this.notify();
		return group;
	}

	openDocument(groupId: string, documentId: string): EditorGroup {
		this.requireDocument(documentId);
		const group = this.requireGroup(groupId);
		const updated = this.withDocument(group, documentId, documentId);
		this.groups.set(groupId, updated);
		this.activeGroupId = groupId;
		this.documents.select(documentId);
		this.notify();
		return updated;
	}

	moveDocument(documentId: string, groupId: string): EditorGroup {
		this.requireDocument(documentId);
		const target = this.requireGroup(groupId);
		for (const group of this.groups.values()) {
			const documentIds = group.documentIds.filter((id) => id !== documentId);
			this.groups.set(group.groupId, {
				...group,
				documentIds,
				activeDocumentId:
					group.activeDocumentId === documentId
						? (documentIds[0] ?? null)
						: group.activeDocumentId,
			});
		}
		const updated = this.withDocument(
			this.requireGroup(target.groupId),
			documentId,
			documentId,
		);
		this.groups.set(target.groupId, updated);
		this.activeGroupId = target.groupId;
		this.documents.select(documentId);
		this.notify();
		return updated;
	}

	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	dispose(): void {
		this.documentUnsubscribe();
		this.groups.clear();
		this.listeners.clear();
	}

	private syncFromDocuments(): void {
		if (this.syncing) return;
		this.syncing = true;
		try {
			const documentIds = new Set(
				this.documents.list().map((document) => document.documentId),
			);
			for (const group of this.groups.values()) {
				const ids = group.documentIds.filter((id) => documentIds.has(id));
				this.groups.set(group.groupId, {
					...group,
					documentIds: ids,
					activeDocumentId:
						group.activeDocumentId && documentIds.has(group.activeDocumentId)
							? group.activeDocumentId
							: (ids[0] ?? null),
				});
			}
			const activeDocumentId = this.documents.getActiveDocumentId();
			const activeGroup = this.requireGroup(this.activeGroupId);
			if (activeDocumentId && !documentIds.has(activeDocumentId)) return;
			if (
				activeDocumentId &&
				!activeGroup.documentIds.includes(activeDocumentId)
			)
				this.groups.set(
					activeGroup.groupId,
					this.withDocument(activeGroup, activeDocumentId, activeDocumentId),
				);
			else if (
				activeDocumentId &&
				activeGroup.activeDocumentId !== activeDocumentId
			)
				this.groups.set(
					activeGroup.groupId,
					this.withDocument(activeGroup, activeDocumentId, activeDocumentId),
				);
			this.notify();
		} finally {
			this.syncing = false;
		}
	}

	private withDocument(
		group: EditorGroup,
		documentId: string,
		activeDocumentId: string | null,
	): EditorGroup {
		return {
			...group,
			documentIds: group.documentIds.includes(documentId)
				? group.documentIds
				: [...group.documentIds, documentId],
			activeDocumentId,
		};
	}

	private requireGroup(groupId: string): EditorGroup {
		const group = this.groups.get(groupId);
		if (!group)
			throw new DocumentManagerError(
				"EDITOR_GROUP_NOT_FOUND",
				"Editor group not found",
			);
		return group;
	}

	private requireDocument(documentId: string): MacroDocument {
		const document = this.documents.get(documentId);
		if (!document)
			throw new DocumentManagerError(
				"EDITOR_DOCUMENT_NOT_FOUND",
				"The editor document is unavailable",
			);
		return document;
	}

	private notify(): void {
		for (const listener of this.listeners) listener();
	}
}

function createGroupId(): string {
	return `macro-editor-group-${crypto.randomUUID()}`;
}
