import type { KvBackend } from "@stateful-mcp/core";
import type { ClinicalProvenance } from "./clinical-operation";

export type ClinicalDocumentStatus = "draft" | "signed" | "amended" | "voided";

export interface ClinicalDocumentRecord {
	recordId: string;
	schemaName: string;
	schemaVersion: number;
	values: Record<string, unknown>;
	version: number;
	removed?: boolean;
	provenance?: ClinicalProvenance;
}

export interface ClinicalDocumentReadModel {
	documentId: string;
	sessionId: string;
	patientId: string;
	status: ClinicalDocumentStatus;
	signedBy?: string;
	signedAt?: string;
	amendmentNotes: string[];
	records: Record<string, ClinicalDocumentRecord>;
	version: number;
	eventHead?: string;
}

export interface ClinicalDocumentProjectionStore {
	get(documentId: string): Promise<ClinicalDocumentReadModel | null>;
	list(sessionId: string): Promise<ClinicalDocumentReadModel[]>;
	save(document: ClinicalDocumentReadModel): Promise<void>;
}

export class InMemoryClinicalDocumentProjectionStore
	implements ClinicalDocumentProjectionStore
{
	private readonly documents = new Map<string, ClinicalDocumentReadModel>();

	get(documentId: string): Promise<ClinicalDocumentReadModel | null> {
		return Promise.resolve(this.documents.get(documentId) ?? null);
	}

	list(sessionId: string): Promise<ClinicalDocumentReadModel[]> {
		return Promise.resolve(
			[...this.documents.values()].filter(
				(document) => document.sessionId === sessionId,
			),
		);
	}

	save(document: ClinicalDocumentReadModel): Promise<void> {
		this.documents.set(document.documentId, document);
		return Promise.resolve();
	}
}

export class KvClinicalDocumentProjectionStore
	implements ClinicalDocumentProjectionStore
{
	constructor(
		private readonly backend: KvBackend,
		private readonly prefix = "v2:clinical:document:",
	) {}

	async get(documentId: string): Promise<ClinicalDocumentReadModel | null> {
		const data = await this.backend.load();
		const value = data[`${this.prefix}${documentId}`];
		return typeof value === "string"
			? (JSON.parse(value) as ClinicalDocumentReadModel)
			: null;
	}

	async list(sessionId: string): Promise<ClinicalDocumentReadModel[]> {
		const data = await this.backend.load();
		return Object.values(data)
			.map((value) =>
				typeof value === "string"
					? (JSON.parse(value) as ClinicalDocumentReadModel)
					: null,
			)
			.filter((document): document is ClinicalDocumentReadModel =>
				Boolean(document && document.sessionId === sessionId),
			);
	}

	async save(document: ClinicalDocumentReadModel): Promise<void> {
		await this.backend.set(
			`${this.prefix}${document.documentId}`,
			JSON.stringify(document),
		);
		await this.backend.save();
	}
}

export interface SignedDocumentRecord {
	documentId: string;
	sessionId: string;
	patientId: string;
	documentVersion: number;
	documentHead: string;
	eventRange: { from: string; to: string };
	workspaceEventHead?: string;
	transactionIds: string[];
	provenance: { actorId: string; signedAt: string };
	documentSnapshot: ClinicalDocumentReadModel;
	createdAt: string;
}

export interface SignedDocumentArchive {
	archive(record: SignedDocumentRecord): Promise<void>;
	get(documentId: string): Promise<SignedDocumentRecord | null>;
	getBySession(sessionId: string): Promise<SignedDocumentRecord | null>;
	listForPatient(patientId: string): Promise<SignedDocumentRecord[]>;
}

export class InMemorySignedDocumentArchive implements SignedDocumentArchive {
	private readonly records = new Map<string, SignedDocumentRecord>();

	async archive(record: SignedDocumentRecord): Promise<void> {
		this.records.set(record.documentId, record);
	}

	async get(documentId: string): Promise<SignedDocumentRecord | null> {
		return this.records.get(documentId) ?? null;
	}

	async getBySession(sessionId: string): Promise<SignedDocumentRecord | null> {
		return (
			[...this.records.values()].find(
				(record) => record.sessionId === sessionId,
			) ?? null
		);
	}

	async listForPatient(patientId: string): Promise<SignedDocumentRecord[]> {
		return [...this.records.values()].filter(
			(record) => record.patientId === patientId,
		);
	}
}

export class KvSignedDocumentArchive implements SignedDocumentArchive {
	constructor(
		private readonly backend: KvBackend,
		private readonly prefix = "v2:clinical:signed:",
	) {}

	async archive(record: SignedDocumentRecord): Promise<void> {
		await this.backend.set(
			`${this.prefix}${record.documentId}`,
			JSON.stringify(record),
		);
		await this.backend.save();
	}

	async get(documentId: string): Promise<SignedDocumentRecord | null> {
		const data = await this.backend.load();
		const value = data[`${this.prefix}${documentId}`];
		return typeof value === "string"
			? (JSON.parse(value) as SignedDocumentRecord)
			: null;
	}

	async getBySession(sessionId: string): Promise<SignedDocumentRecord | null> {
		return (
			(await this.list()).find((record) => record.sessionId === sessionId) ??
			null
		);
	}

	async listForPatient(patientId: string): Promise<SignedDocumentRecord[]> {
		return (await this.list()).filter(
			(record) => record.patientId === patientId,
		);
	}

	private async list(): Promise<SignedDocumentRecord[]> {
		const data = await this.backend.load();
		return Object.entries(data)
			.filter(([key]) => key.startsWith(this.prefix))
			.map(([, value]) =>
				typeof value === "string"
					? (JSON.parse(value) as SignedDocumentRecord)
					: null,
			)
			.filter((record): record is SignedDocumentRecord => Boolean(record));
	}
}
