import * as fs from "fs/promises";
import * as path from "path";
import type { EntityStore } from "./interfaces";

async function ensureDir(filePath: string): Promise<void> {
	await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function fileExists(filePath: string): Promise<boolean> {
	try {
		await fs.access(filePath);
		return true;
	} catch {
		return false;
	}
}

export class JsonlEntityStore<T> implements EntityStore<T> {
	private initialized = false;
	private cache = new Map<string, T>();
	private writeQueue: Promise<void> = Promise.resolve();

	constructor(private filePath: string) {}

	private async init(): Promise<void> {
		if (this.initialized) return;
		try {
			if (await fileExists(this.filePath)) {
				const raw = await fs.readFile(this.filePath, "utf-8");
				const lines = raw.split("\n");
				for (const line of lines) {
					if (!line.trim()) continue;
					const entry = JSON.parse(line);
					if (entry.type === "set") {
						this.cache.set(entry.id, entry.data);
					} else if (entry.type === "delete") {
						this.cache.delete(entry.id);
					}
				}
			}
		} catch (err: any) {
			if (err.code !== "ENOENT") throw err;
		}
		this.initialized = true;
	}

	private async enqueueWrite(fn: () => Promise<void>): Promise<void> {
		this.writeQueue = this.writeQueue.then(fn).catch((err) => {
			console.error(`JSONL write error in ${this.filePath}:`, err);
		});
		return this.writeQueue;
	}

	private async appendLine(line: string): Promise<void> {
		await this.enqueueWrite(async () => {
			await ensureDir(this.filePath);
			await fs.appendFile(this.filePath, line + "\n", "utf-8");
		});
	}

	async get(id: string): Promise<T | null> {
		await this.init();
		return this.cache.get(id) || null;
	}

	async set(id: string, entity: T): Promise<void> {
		await this.init();
		this.cache.set(id, entity);
		await this.appendLine(JSON.stringify({ type: "set", id, data: entity }));
	}

	async list(): Promise<T[]> {
		await this.init();
		return Array.from(this.cache.values());
	}

	async delete(id: string): Promise<void> {
		await this.init();
		if (this.cache.has(id)) {
			this.cache.delete(id);
			await this.appendLine(JSON.stringify({ type: "delete", id }));
		}
	}
}
