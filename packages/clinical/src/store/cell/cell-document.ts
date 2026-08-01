import type { CellCollectionRef, CellKind } from "../../session/cell";

export interface CellCollectionDocument {
	collection: CellCollectionRef;
	ordering: string[];
	activeIndex: number;
	draftText: string;
}

export interface CellDocument {
	sessionId: string;
	updatedAt: string;
	collections: Record<string, CellCollectionDocument>;
}

export interface CellDocumentStore {
	getSessionIds(): Promise<string[]>;
	loadDocument(sessionId: string): Promise<CellDocument | null>;
	saveDocument(document: CellDocument): Promise<void>;
	loadCollection(
		sessionId: string,
		collection: CellCollectionRef,
	): Promise<CellCollectionDocument | null>;
	saveCollection(
		sessionId: string,
		collection: CellCollectionDocument,
	): Promise<void>;
	listCollections(sessionId: string): Promise<CellCollectionDocument[]>;
}

export function collectionKey(collection: CellCollectionRef): string {
	return `${collection.kind}:${collection.collectionId}`;
}

export function emptyCellDocument(sessionId: string): CellDocument {
	return {
		sessionId,
		updatedAt: new Date().toISOString(),
		collections: {},
	};
}

export function emptyCellCollection(
	kind: CellKind,
	collectionId: string,
): CellCollectionDocument {
	return {
		collection: { kind, collectionId },
		ordering: [],
		activeIndex: 0,
		draftText: "",
	};
}
