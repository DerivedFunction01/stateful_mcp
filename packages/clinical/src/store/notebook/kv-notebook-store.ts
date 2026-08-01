import type { KvBackend } from "@stateful-mcp/core";
import type { Cell, CellCollectionRef } from "../../session/cell";
import type { CellCollectionDocument } from "../cell/cell-document";
import { collectionKey } from "../cell/cell-document";
import type { NotebookCellRef, NotebookSessionDocument } from "./interfaces";
import type { NotebookStore } from "./notebook-store";

const SESSIONS_INDEX_KEY = "notebook:sessions";

function docKey(sessionId: string): string {
	return `notebook:${sessionId}`;
}

/**
 * Kv-backed durable notebook store.
 *
 * Each session is stored as a single blob under `notebook:{sessionId}`
 * containing the whole serialized `NotebookSessionDocument`. A separate
 * index key (`notebook:sessions`) tracks the known session ids for
 * multi-session enumeration.
 */
export class KvNotebookStore implements NotebookStore {
	constructor(private readonly backend: KvBackend) {}

	async getSessionIds(): Promise<string[]> {
		const data = await this.backend.load();
		const raw = data[SESSIONS_INDEX_KEY];
		if (!raw) return [];
		const parsed = JSON.parse(raw as string);
		return Array.isArray(parsed) ? (parsed as string[]) : [];
	}

	async loadDocument(
		sessionId: string,
	): Promise<NotebookSessionDocument | null> {
		const data = await this.backend.load();
		const raw = data[docKey(sessionId)];
		if (!raw) return null;
		return JSON.parse(raw as string) as NotebookSessionDocument;
	}

	async saveDocument(doc: NotebookSessionDocument): Promise<void> {
		await this.ensureSessionIndexed(doc.sessionId);
		await this.backend.set(docKey(doc.sessionId), JSON.stringify(doc));
		await this.backend.save();
	}

	async loadCollection(
		sessionId: string,
		collection: CellCollectionRef,
	): Promise<CellCollectionDocument | null> {
		const document = await this.loadDocument(sessionId);
		return document?.collections?.[collectionKey(collection)] ?? null;
	}

	async saveCollection(
		sessionId: string,
		collection: CellCollectionDocument,
	): Promise<void> {
		const document =
			(await this.loadDocument(sessionId)) ?? emptyDocument(sessionId);
		document.collections ??= {};
		document.collections[collectionKey(collection.collection)] = collection;
		await this.saveDocument(document);
	}

	async listCollections(sessionId: string): Promise<CellCollectionDocument[]> {
		const document = await this.loadDocument(sessionId);
		return document?.collections ? Object.values(document.collections) : [];
	}

	async listSession(sessionId: string): Promise<NotebookCellRef[]> {
		const doc = await this.loadDocument(sessionId);
		if (!doc) return [];
		return doc.ordering
			.filter((id) => doc.cells[id])
			.map((cellId, position) => {
				const cell = doc.cells[cellId]!;
				return {
					sessionId,
					cellId,
					position,
					updatedAt: cell.updatedAt,
				};
			});
	}

	async getCell(sessionId: string, cellId: string): Promise<Cell | null> {
		const doc = await this.loadDocument(sessionId);
		if (!doc) return null;
		return doc.cells[cellId] ?? null;
	}

	async insertCell(
		sessionId: string,
		cell: Cell,
		position: number,
	): Promise<void> {
		const doc =
			(await this.loadDocument(sessionId)) ?? emptyDocument(sessionId);
		doc.cells[cell.cellId] = { ...cell, sessionId };
		if (position < 0 || position >= doc.ordering.length) {
			doc.ordering.push(cell.cellId);
		} else {
			doc.ordering.splice(position, 0, cell.cellId);
		}
		doc.updatedAt = new Date().toISOString();
		await this.saveDocument(doc);
	}

	async deleteCell(sessionId: string, cellId: string): Promise<void> {
		const doc = await this.loadDocument(sessionId);
		if (!doc) return;
		delete doc.cells[cellId];
		doc.ordering = doc.ordering.filter((id) => id !== cellId);
		doc.updatedAt = new Date().toISOString();
		await this.saveDocument(doc);
	}

	async moveCell(
		sessionId: string,
		cellId: string,
		newPosition: number,
	): Promise<void> {
		const doc = await this.loadDocument(sessionId);
		if (!doc) return;
		const idx = doc.ordering.indexOf(cellId);
		if (idx === -1) return;
		doc.ordering.splice(idx, 1);
		const clamped = Math.max(0, Math.min(newPosition, doc.ordering.length));
		doc.ordering.splice(clamped, 0, cellId);
		doc.updatedAt = new Date().toISOString();
		await this.saveDocument(doc);
	}

	private async ensureSessionIndexed(sessionId: string): Promise<void> {
		const data = await this.backend.load();
		const raw = data[SESSIONS_INDEX_KEY];
		const existing: string[] = raw
			? (JSON.parse(raw as string) as string[])
			: [];
		if (!existing.includes(sessionId)) {
			existing.push(sessionId);
			await this.backend.set(SESSIONS_INDEX_KEY, JSON.stringify(existing));
		}
	}
}

function emptyDocument(sessionId: string): NotebookSessionDocument {
	return {
		sessionId,
		updatedAt: new Date().toISOString(),
		ordering: [],
		cells: {},
		activeIndex: 0,
		draftText: "",
	};
}
