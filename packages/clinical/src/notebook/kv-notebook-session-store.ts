import type { KvBackend } from "@stateful-mcp/core";
import type {
	NotebookSessionRecord,
	NotebookSessionStore,
} from "./notebook-session-store";

export class KvNotebookSessionStore implements NotebookSessionStore {
	constructor(
		private readonly backend: KvBackend,
		private readonly prefix = "v2:notebook-session:",
	) {}

	async get(sessionId: string): Promise<NotebookSessionRecord | null> {
		const data = await this.backend.load();
		return read(data[`${this.prefix}${sessionId}`]);
	}

	async list(): Promise<NotebookSessionRecord[]> {
		const data = await this.backend.load();
		return Object.entries(data)
			.filter(([key]) => key.startsWith(this.prefix))
			.map(([, value]) => read(value))
			.filter((record): record is NotebookSessionRecord => Boolean(record));
	}

	async save(
		record: NotebookSessionRecord,
		expectedRevision?: number,
	): Promise<void> {
		const existing = await this.get(record.sessionId);
		if (
			expectedRevision !== undefined &&
			existing?.revision !== expectedRevision
		)
			throw new Error(
				`Notebook session '${record.sessionId}' revision mismatch`,
			);
		await this.backend.set(
			`${this.prefix}${record.sessionId}`,
			JSON.stringify(record),
		);
		await this.backend.save();
	}

	async delete(sessionId: string): Promise<void> {
		await this.backend.delete(`${this.prefix}${sessionId}`);
		await this.backend.save();
	}
}

function read(value: unknown): NotebookSessionRecord | null {
	if (typeof value !== "string") return null;
	try {
		return JSON.parse(value) as NotebookSessionRecord;
	} catch {
		return null;
	}
}
