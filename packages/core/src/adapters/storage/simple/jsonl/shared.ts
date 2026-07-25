import * as fs from "fs/promises";
import * as path from "path";

export interface WalOptions {
	maxWalEntries?: number;
	maxWalBytes?: number;
}

export type RequiredWalOptions = Required<WalOptions>;

export const DEFAULT_WAL_OPTIONS: RequiredWalOptions = {
	maxWalEntries: 1000,
	maxWalBytes: 1_048_576,
};

export class JsonlWal {
	private writeTail: Promise<void> = Promise.resolve();
	private walEntries = 0;
	private walBytes = 0;

	constructor(
		private dataFilePath: string,
		options?: WalOptions,
	) {
		this.options = { ...DEFAULT_WAL_OPTIONS, ...options };
	}

	private options: RequiredWalOptions;

	get walPath(): string {
		return this.dataFilePath.replace(/\.jsonl$/, ".wal.jsonl");
	}

	async append(delta: unknown): Promise<void> {
		const line = JSON.stringify(delta) + "\n";
		this.walEntries++;
		this.walBytes += Buffer.byteLength(line, "utf-8");
		this.writeTail = this.writeTail
			.then(() =>
				fs.mkdir(path.dirname(this.walPath), { recursive: true }),
			)
			.then(() => fs.appendFile(this.walPath, line, "utf-8"));
		return this.writeTail;
	}

	async flush(): Promise<void> {
		await this.writeTail;
	}

	async *replay(): AsyncIterable<unknown> {
		try {
			const raw = await fs.readFile(this.walPath, "utf-8");
			for (const line of raw.split("\n")) {
				if (!line.trim()) continue;
				yield JSON.parse(line);
			}
		} catch (err: any) {
			if (err.code !== "ENOENT") throw err;
		}
	}

	async reconcile(canonical: string[]): Promise<void> {
		await fs.mkdir(path.dirname(this.dataFilePath), { recursive: true });
		const content =
			canonical.join("\n") + (canonical.length > 0 ? "\n" : "");
		await fs.writeFile(this.dataFilePath, content, "utf-8");
		await fs.writeFile(this.walPath, "", "utf-8");
		this.walEntries = 0;
		this.walBytes = 0;
	}

	exceedsThresholds(): boolean {
		return (
			this.walEntries >= this.options.maxWalEntries ||
			this.walBytes >= this.options.maxWalBytes
		);
	}
}
