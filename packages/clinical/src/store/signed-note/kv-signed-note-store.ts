import type { KvBackend } from "@stateful-mcp/core";
import type { SignedSoapNoteRecord, SignedSoapNoteStore } from "../interfaces";

export class KvSignedSoapNoteStore implements SignedSoapNoteStore {
	constructor(private readonly backend: KvBackend) {}

	async archive(
		record: Omit<SignedSoapNoteRecord, "createdAt">,
	): Promise<void> {
		await this.backend.set(record.noteId, JSON.stringify(record));
		await this.backend.save();
	}

	async get(noteId: string): Promise<SignedSoapNoteRecord | null> {
		const data = await this.backend.load();
		const raw = data[noteId];
		if (!raw) return null;
		return JSON.parse(raw as string) as SignedSoapNoteRecord;
	}

	async getBySession(sessionId: string): Promise<SignedSoapNoteRecord | null> {
		const all = await this.loadAll();
		return all.find((r) => r.sessionId === sessionId) || null;
	}

	async listForPatient(patientId: string): Promise<SignedSoapNoteRecord[]> {
		const all = await this.loadAll();
		return all.filter((r) => r.patientId === patientId);
	}

	private async loadAll(): Promise<SignedSoapNoteRecord[]> {
		const data = await this.backend.load();
		return Object.values(data)
			.map((v) => JSON.parse(v as string) as SignedSoapNoteRecord)
			.filter(Boolean);
	}
}
