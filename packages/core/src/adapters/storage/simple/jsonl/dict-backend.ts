import * as fs from "fs/promises";
import * as path from "path";
import type {
	Concept,
	ConceptRelation,
	CustomExpression,
	Namespace,
} from "../../../../middleware/dictionary/types";
import type {
	ConceptStoreBackend,
	DictDelta,
	ExpressionStoreBackend,
} from "../dict-backend";
import { JsonlWal } from "./shared";

async function fileOrDirExists(filePath: string): Promise<boolean> {
	try {
		await fs.access(filePath);
		return true;
	} catch {
		return false;
	}
}

export class JsonlConceptStoreBackend implements ConceptStoreBackend {
	private cacheConcepts = new Map<string, Concept>();
	private cacheNamespaces = new Map<string, Namespace>();
	private cacheRelations: ConceptRelation[] = [];
	private wal?: JsonlWal;

	constructor(
		private filePath: string,
		walOptions?: { maxWalEntries?: number; maxWalBytes?: number },
	) {
		if (this.filePath) {
			this.wal = new JsonlWal(this.filePath, walOptions);
		}
	}

	async load(
		concepts: Map<string, Concept>,
		namespaces: Map<string, Namespace>,
		relations: ConceptRelation[],
	): Promise<void> {
		concepts.clear();
		namespaces.clear();
		relations.length = 0;
		this.cacheConcepts.clear();
		this.cacheNamespaces.clear();
		this.cacheRelations = [];

		if (await fileOrDirExists(this.filePath)) {
			const raw = await fs.readFile(this.filePath, "utf-8");
			for (const line of raw.split("\n")) {
				if (!line.trim()) continue;
				const entry = JSON.parse(line);
				if (entry.type === "concept") {
					concepts.set(entry.data.id, entry.data);
					this.cacheConcepts.set(entry.data.id, entry.data);
				} else if (entry.type === "namespace") {
					namespaces.set(entry.data.code, entry.data);
					this.cacheNamespaces.set(entry.data.code, entry.data);
				} else if (entry.type === "relation") {
					relations.push(entry.data);
					this.cacheRelations.push(entry.data);
				}
			}
		}

		if (this.wal) {
			for await (const entry of this.wal.replay() as any) {
				this.applyDelta(entry);
			}
		}

		for (const c of this.cacheConcepts.values()) {
			if (!concepts.has(c.id)) concepts.set(c.id, c);
		}
		for (const ns of this.cacheNamespaces.values()) {
			if (!namespaces.has(ns.code)) namespaces.set(ns.code, ns);
		}
		for (const r of this.cacheRelations) {
			if (!relations.find((x) => x.id === r.id)) relations.push(r);
		}
	}

	async saveDelta(deltas: DictDelta[]): Promise<void> {
		if (!this.wal) return;

		for (const delta of deltas) {
			await this.wal.append(delta);
			this.applyDelta(delta);
		}

		if (this.wal.exceedsThresholds()) {
			await this.compact();
		}
	}

	private applyDelta(delta: DictDelta): void {
		if (delta.kind === "concept") {
			if (delta.op === "set" && delta.data) {
				this.cacheConcepts.set(delta.id, delta.data as Concept);
			} else {
				this.cacheConcepts.delete(delta.id);
			}
		} else if (delta.kind === "namespace") {
			if (delta.op === "set" && delta.data) {
				this.cacheNamespaces.set(delta.id, delta.data as Namespace);
			} else {
				this.cacheNamespaces.delete(delta.id);
			}
		} else if (delta.kind === "relation") {
			if (delta.op === "set" && delta.data) {
				const idx = this.cacheRelations.findIndex(
					(r) => r.id === delta.id,
				);
				if (idx !== -1) {
					this.cacheRelations[idx] = delta.data as ConceptRelation;
				} else {
					this.cacheRelations.push(delta.data as ConceptRelation);
				}
			} else {
				this.cacheRelations = this.cacheRelations.filter(
					(r) => r.id !== delta.id,
				);
			}
		}
	}

	async compact(): Promise<void> {
		if (!this.wal) return;
		const lines: string[] = [];
		for (const ns of this.cacheNamespaces.values()) {
			lines.push(JSON.stringify({ type: "namespace", data: ns }));
		}
		for (const c of this.cacheConcepts.values()) {
			lines.push(JSON.stringify({ type: "concept", data: c }));
		}
		for (const r of this.cacheRelations) {
			lines.push(JSON.stringify({ type: "relation", data: r }));
		}
		await this.wal.reconcile(lines);
	}
}

export class JsonlExpressionStoreBackend implements ExpressionStoreBackend {
	private cacheExpressions: CustomExpression[] = [];
	private wal?: JsonlWal;

	constructor(
		private filePath: string,
		walOptions?: { maxWalEntries?: number; maxWalBytes?: number },
	) {
		if (this.filePath) {
			this.wal = new JsonlWal(this.filePath, walOptions);
		}
	}

	async load(expressions: CustomExpression[]): Promise<void> {
		expressions.length = 0;
		this.cacheExpressions = [];

		if (await fileOrDirExists(this.filePath)) {
			const raw = await fs.readFile(this.filePath, "utf-8");
			for (const line of raw.split("\n")) {
				if (!line.trim()) continue;
				const entry = JSON.parse(line);
				if (entry.type === "expression") {
					expressions.push(entry.data);
					this.cacheExpressions.push(entry.data);
				}
			}
		}

		if (this.wal) {
			for await (const entry of this.wal.replay() as any) {
				this.applyDelta(entry);
			}
		}

		for (const e of this.cacheExpressions) {
			if (!expressions.find((x) => x.id === e.id)) {
				expressions.push(e);
			}
		}
	}

	async saveDelta(deltas: DictDelta[]): Promise<void> {
		if (!this.wal) return;

		for (const delta of deltas) {
			await this.wal.append(delta);
			this.applyDelta(delta);
		}

		if (this.wal.exceedsThresholds()) {
			await this.compact();
		}
	}

	private applyDelta(delta: DictDelta): void {
		if (delta.kind !== "expression") return;
		if (delta.op === "set" && delta.data) {
			const idx = this.cacheExpressions.findIndex(
				(e) => e.id === delta.id,
			);
			if (idx !== -1) {
				this.cacheExpressions[idx] = delta.data as CustomExpression;
			} else {
				this.cacheExpressions.push(delta.data as CustomExpression);
			}
		} else {
			this.cacheExpressions = this.cacheExpressions.filter(
				(e) => e.id !== delta.id,
			);
		}
	}

	async compact(): Promise<void> {
		if (!this.wal) return;
		const lines = this.cacheExpressions.map((e) =>
			JSON.stringify({ type: "expression", data: e }),
		);
		await this.wal.reconcile(lines);
	}
}
