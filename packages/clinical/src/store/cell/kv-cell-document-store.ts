import type { KvBackend } from "@stateful-mcp/core";
import type { CellCollectionRef } from "../../session/cell";
import {
	type CellCollectionDocument,
	type CellDocument,
	type CellDocumentStore,
	collectionKey,
	emptyCellCollection,
	emptyCellDocument,
} from "./cell-document";

const keyFor = (sessionId: string) => `cell-document:${sessionId}`;

export class KvCellDocumentStore implements CellDocumentStore {
	constructor(private readonly backend: KvBackend) {}

	async getSessionIds(): Promise<string[]> {
		const data = await this.backend.load();
		return Object.keys(data)
			.filter((key) => key.startsWith("cell-document:"))
			.map((key) => key.slice("cell-document:".length));
	}

	async loadDocument(sessionId: string): Promise<CellDocument | null> {
		const data = await this.backend.load();
		const raw = data[keyFor(sessionId)];
		return raw ? (JSON.parse(raw as string) as CellDocument) : null;
	}

	async saveDocument(document: CellDocument): Promise<void> {
		document.updatedAt = new Date().toISOString();
		await this.backend.set(
			keyFor(document.sessionId),
			JSON.stringify(document),
		);
		await this.backend.save();
	}

	async loadCollection(
		sessionId: string,
		collection: CellCollectionRef,
	): Promise<CellCollectionDocument | null> {
		const document = await this.loadDocument(sessionId);
		return document?.collections[collectionKey(collection)] ?? null;
	}

	async saveCollection(
		sessionId: string,
		collection: CellCollectionDocument,
	): Promise<void> {
		const document =
			(await this.loadDocument(sessionId)) ?? emptyCellDocument(sessionId);
		document.collections[collectionKey(collection.collection)] = collection;
		await this.saveDocument(document);
	}

	async listCollections(sessionId: string): Promise<CellCollectionDocument[]> {
		const document = await this.loadDocument(sessionId);
		return document ? Object.values(document.collections) : [];
	}

	async ensureCollection(
		sessionId: string,
		collection: CellCollectionRef,
	): Promise<CellCollectionDocument> {
		const existing = await this.loadCollection(sessionId, collection);
		if (existing) return existing;
		const created = emptyCellCollection(
			collection.kind,
			collection.collectionId,
		);
		await this.saveCollection(sessionId, created);
		return created;
	}
}
