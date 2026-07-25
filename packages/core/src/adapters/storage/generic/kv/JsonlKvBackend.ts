import * as fs from "fs/promises";
import { JsonlWal, type WalOptions } from "../JsonlWal";
import type { KvBackend } from "./KvBackend";

export interface JsonlKvBackendOptions extends WalOptions {
	dataFilePath: string;
}

export class JsonlKvBackend implements KvBackend {
	private data = new Map<string, unknown>();
	private readonly wal: JsonlWal;

	constructor(options: JsonlKvBackendOptions) {
		this.wal = new JsonlWal(options.dataFilePath, {
			maxWalEntries: options.maxWalEntries,
			maxWalBytes: options.maxWalBytes,
		});
	}

	async load(): Promise<Record<string, unknown>> {
		this.data.clear();
		try {
			const raw = await fs.readFile(
				this.wal.walPath.replace(/\.wal\.jsonl$/, ".jsonl"),
				"utf-8",
			);
			for (const line of raw.split("\n")) {
				if (!line.trim()) continue;
				const entry = JSON.parse(line) as { key: string; value: unknown };
				this.data.set(entry.key, entry.value);
			}
		} catch (err: any) {
			if (err.code !== "ENOENT") throw err;
		}
		for await (const entry of this.wal.replay()) {
			const e = entry as { op: string; key: string; value?: unknown };
			if (e.op === "set") this.data.set(e.key, e.value);
			else if (e.op === "delete") this.data.delete(e.key);
		}
		const result: Record<string, unknown> = {};
		for (const [k, v] of this.data) result[k] = v;
		return result;
	}

	async set(key: string, value: unknown): Promise<void> {
		this.data.set(key, value);
		await this.wal.append({ op: "set", key, value });
	}

	async delete(key: string): Promise<void> {
		this.data.delete(key);
		await this.wal.append({ op: "delete", key });
	}

	async save(): Promise<void> {
		await this.wal.flush();
		if (this.wal.exceedsThresholds()) {
			const canonical: string[] = [];
			for (const [k, v] of this.data) {
				canonical.push(JSON.stringify({ key: k, value: v }));
			}
			await this.wal.reconcile(canonical);
		}
	}
}
