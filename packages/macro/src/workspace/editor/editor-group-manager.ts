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

export type EditorLayoutNode =
	| {
			readonly kind: "group";
			readonly groupId: string;
			readonly sizeRatio?: number;
	  }
	| {
			readonly kind: "split";
			readonly nodeId: string;
			readonly orientation: "horizontal" | "vertical";
			readonly children: readonly EditorLayoutNode[];
			readonly sizeRatios?: readonly number[];
	  };

export interface CreateEditorGroupOptions {
	readonly sourceGroupId?: string;
	readonly documentId?: string;
	readonly orientation?: "horizontal" | "vertical";
	readonly moveDocument?: boolean;
	readonly behavior?: "duplicate" | "empty";
}

export class MacroEditorGroupManager {
	private readonly groups = new Map<string, EditorGroup>();
	private readonly listeners = new Set<() => void>();
	private readonly documentUnsubscribe: () => void;
	private activeGroupId: string;
	private layoutRoot: EditorLayoutNode;
	private syncing = false;

	constructor(private readonly documents: MacroDocumentManager) {
		const initial = createGroupId();
		const activeDocumentId = documents.getActiveDocumentId();
		this.groups.set(initial, {
			groupId: initial,
			documentIds: activeDocumentId ? [activeDocumentId] : [],
			activeDocumentId,
			orientation: "vertical",
		});
		this.activeGroupId = initial;
		this.layoutRoot = { kind: "group", groupId: initial };
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

	getLayoutRoot(): EditorLayoutNode {
		return this.layoutRoot;
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
		if (
			(options.behavior ?? "duplicate") !== "empty" &&
			options.moveDocument &&
			documentId &&
			source.documentIds.includes(documentId)
		) {
			const remainingSourceDocs = source.documentIds.filter(
				(id) => id !== documentId,
			);
			this.groups.set(source.groupId, {
				...source,
				documentIds: remainingSourceDocs,
				activeDocumentId:
					source.activeDocumentId === documentId
						? (remainingSourceDocs[0] ?? null)
						: source.activeDocumentId,
			});
		}
		const targetOrientation = options.orientation ?? "vertical";
		const group: EditorGroup = {
			groupId: createGroupId(),
			documentIds:
				(options.behavior ?? "duplicate") === "empty"
					? []
					: documentId
						? [documentId]
						: [],
			activeDocumentId:
				(options.behavior ?? "duplicate") === "empty" ? null : documentId,
			orientation: targetOrientation,
		};
		this.groups.set(group.groupId, group);
		this.layoutRoot = insertSplitRecursive(
			this.layoutRoot,
			source.groupId,
			group.groupId,
			targetOrientation,
		);
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
		let targetId = nearestSibling(this.layoutRoot, groupId);
		if (!targetId) {
			for (const other of this.groups.keys()) {
				if (other !== groupId) {
					targetId = other;
					break;
				}
			}
		}
		const target = targetId ? this.groups.get(targetId) : undefined;
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
		const nextLayout = removeGroup(this.layoutRoot, groupId);
		if (!nextLayout)
			throw new DocumentManagerError(
				"EDITOR_LAST_GROUP",
				"At least one editor group must remain open",
			);
		this.layoutRoot = nextLayout;
		if (this.activeGroupId === groupId) {
			this.activeGroupId = nextTarget.groupId;
			if (nextTarget.activeDocumentId) {
				this.documents.select(nextTarget.activeDocumentId);
			}
		}
		this.notify();
		return group;
	}

	resizeSplit(nodeId: string, ratios: readonly number[]): void {
		this.layoutRoot = updateSplitRatios(this.layoutRoot, nodeId, ratios);
		// Update individual group sizeRatios if applicable
		applyGroupRatios(this.layoutRoot, this.groups);
		this.notify();
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

	closeDocumentInGroup(groupId: string, documentId: string): EditorGroup {
		const group = this.requireGroup(groupId);
		if (!group.documentIds.includes(documentId))
			throw new DocumentManagerError(
				"EDITOR_DOCUMENT_NOT_FOUND",
				"The editor document is not open in this group",
			);
		const documentIds = group.documentIds.filter((id) => id !== documentId);
		const updated: EditorGroup = {
			...group,
			documentIds,
			activeDocumentId:
				group.activeDocumentId === documentId
					? (documentIds[0] ?? null)
					: group.activeDocumentId,
		};
		this.groups.set(groupId, updated);
		if (
			this.activeGroupId === groupId &&
			group.activeDocumentId === documentId
		) {
			const nextDocumentId = updated.activeDocumentId;
			if (nextDocumentId) this.documents.select(nextDocumentId);
		}
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
			const activeGroup = this.groups.get(this.activeGroupId);
			if (
				activeGroup &&
				activeDocumentId &&
				documentIds.has(activeDocumentId)
			) {
				if (!activeGroup.documentIds.includes(activeDocumentId)) {
					this.groups.set(
						activeGroup.groupId,
						this.withDocument(activeGroup, activeDocumentId, activeDocumentId),
					);
				} else if (activeGroup.activeDocumentId !== activeDocumentId) {
					this.groups.set(
						activeGroup.groupId,
						this.withDocument(activeGroup, activeDocumentId, activeDocumentId),
					);
				}
			}
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

function insertSplitRecursive(
	node: EditorLayoutNode,
	sourceGroupId: string,
	newGroupId: string,
	orientation: "horizontal" | "vertical",
): EditorLayoutNode {
	if (node.kind === "group") {
		if (node.groupId === sourceGroupId) {
			return {
				kind: "split",
				nodeId: createGroupId(),
				orientation,
				children: [
					{ kind: "group", groupId: sourceGroupId },
					{ kind: "group", groupId: newGroupId },
				],
			};
		}
		return node;
	}

	// If this split container matches the requested orientation and directly contains sourceGroupId
	if (node.orientation === orientation) {
		const directChildIndex = node.children.findIndex(
			(child) => child.kind === "group" && child.groupId === sourceGroupId,
		);
		if (directChildIndex !== -1) {
			const nextChildren = [...node.children];
			nextChildren.splice(directChildIndex + 1, 0, {
				kind: "group",
				groupId: newGroupId,
			});
			return {
				...node,
				children: nextChildren,
			};
		}
	}

	return {
		...node,
		children: node.children.map((child) =>
			insertSplitRecursive(child, sourceGroupId, newGroupId, orientation),
		),
	};
}

function removeGroup(
	node: EditorLayoutNode,
	targetGroupId: string,
): EditorLayoutNode | null {
	if (node.kind === "group")
		return node.groupId === targetGroupId ? null : node;
	const children = node.children
		.map((child) => removeGroup(child, targetGroupId))
		.filter((child): child is EditorLayoutNode => child !== null);
	if (children.length === 0) return null;
	if (children.length === 1) return children[0]!;
	return { ...node, children };
}

function updateSplitRatios(
	node: EditorLayoutNode,
	nodeId: string,
	ratios: readonly number[],
): EditorLayoutNode {
	if (node.kind === "group") return node;
	if (node.nodeId === nodeId) {
		const nextChildren = node.children.map((child, idx) => {
			const ratio = ratios[idx];
			if (child.kind === "group" && ratio !== undefined) {
				return { ...child, sizeRatio: ratio };
			}
			return child;
		});
		return {
			...node,
			sizeRatios: ratios,
			children: nextChildren,
		};
	}
	return {
		...node,
		children: node.children.map((child) =>
			updateSplitRatios(child, nodeId, ratios),
		),
	};
}

function applyGroupRatios(
	node: EditorLayoutNode,
	groups: Map<string, EditorGroup>,
): void {
	if (node.kind === "group") {
		if (node.sizeRatio !== undefined) {
			const existing = groups.get(node.groupId);
			if (existing) {
				groups.set(node.groupId, { ...existing, sizeRatio: node.sizeRatio });
			}
		}
		return;
	}
	for (const child of node.children) {
		applyGroupRatios(child, groups);
	}
}

function nearestSibling(
	root: EditorLayoutNode,
	targetGroupId: string,
): string | undefined {
	if (root.kind === "group") return undefined;
	for (const [index, child] of root.children.entries()) {
		if (containsGroup(child, targetGroupId)) {
			for (const sibling of [
				root.children[index - 1],
				root.children[index + 1],
			]) {
				const groupId = firstGroup(sibling);
				if (groupId) return groupId;
			}
			const deeper = nearestSibling(child, targetGroupId);
			if (deeper) return deeper;
			for (const other of root.children) {
				if (other !== child) {
					const groupId = firstGroup(other);
					if (groupId) return groupId;
				}
			}
		}
	}
	return undefined;
}

function containsGroup(node: EditorLayoutNode, groupId: string): boolean {
	return node.kind === "group"
		? node.groupId === groupId
		: node.children.some((child) => containsGroup(child, groupId));
}

function firstGroup(node: EditorLayoutNode | undefined): string | undefined {
	if (!node) return undefined;
	return node.kind === "group" ? node.groupId : firstGroup(node.children[0]);
}
