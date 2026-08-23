import type { ScratchpadExecutionReceipt } from "../scratchpad/scratchpad-session";

export type JournalEntryStatus = "committed" | "reversed" | "superseded";

export interface JournalEntry {
	readonly id: string;
	readonly lineNumber: number;
	readonly macroId: string;
	readonly invokedAs?: string;
	readonly rawText: string;
	readonly result: unknown;
	readonly success?: boolean;
	readonly errorCode?: string;
	readonly identity?: ScratchpadExecutionReceipt["identity"];
	readonly availability?: "available" | "legacy";
	readonly fingerprint: string;
	readonly executedAt: number;
	readonly status: JournalEntryStatus;
	readonly reversalReason?: string;
	readonly reversedAt?: number;
}

export interface JournalStorageAdapter {
	list(): Promise<readonly JournalEntry[]>;
	set(id: string, entry: JournalEntry): Promise<void>;
	clear(): Promise<void>;
}

export interface WorkspaceJournalOptions {
	readonly store?: JournalStorageAdapter;
}

export class WorkspaceJournal {
	private entries: JournalEntry[] = [];
	private readonly listeners = new Set<() => void>();
	private readonly initPromise: Promise<void> | null = null;

	constructor(private readonly options: WorkspaceJournalOptions = {}) {
		if (this.options.store) {
			this.initPromise = this.loadFromStore();
		}
	}

	async ready(): Promise<void> {
		if (this.initPromise) {
			await this.initPromise;
		}
	}

	async loadFromStore(): Promise<void> {
		if (!this.options.store) return;
		try {
			const stored = await this.options.store.list();
			const existingIds = new Set(this.entries.map((e) => e.id));
			const newEntries = stored.filter((e) => !existingIds.has(e.id));
			this.entries = [...this.entries, ...newEntries].sort(
				(a, b) => a.executedAt - b.executedAt,
			);
			this.notify();
		} catch (e) {
			console.error("Error loading journal entries from store:", e);
		}
	}

	getEntries(): readonly JournalEntry[] {
		return this.entries;
	}

	getEntry(id: string): JournalEntry | undefined {
		return this.entries.find((e) => e.id === id);
	}

	getCommittedEntries(): readonly JournalEntry[] {
		return this.entries.filter((e) => e.status === "committed");
	}

	async recordExecution(
		receipt: ScratchpadExecutionReceipt,
	): Promise<JournalEntry> {
		const entry: JournalEntry = {
			id: `journal_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
			lineNumber: receipt.lineNumber,
			macroId: receipt.macroId,
			invokedAs: receipt.invokedAs,
			rawText: receipt.rawText,
			result: receipt.result,
			success: receipt.success,
			...(receipt.error ? { errorCode: "EDITOR_EXECUTION_FAILED" } : {}),
			identity: receipt.identity,
			availability: receipt.identity ? "available" : "legacy",
			fingerprint: await fingerprintReceipt(receipt),
			executedAt: receipt.executedAt,
			status: "committed",
		};

		this.entries.push(entry);

		if (this.options.store) {
			await this.options.store.set(entry.id, entry);
		}

		this.notify();
		return entry;
	}

	async reverseEntry(
		id: string,
		reason = "User requested reversal",
	): Promise<JournalEntry | null> {
		const idx = this.entries.findIndex((e) => e.id === id);
		if (idx === -1) return null;

		const current = this.entries[idx];
		if (!current) return null;
		if (current.status === "reversed") return current;
		if (current.status !== "committed") return null;

		const reversed: JournalEntry = {
			...current,
			status: "reversed",
			reversalReason: reason,
			reversedAt: Date.now(),
		};

		this.entries[idx] = reversed;

		if (this.options.store) {
			await this.options.store.set(reversed.id, reversed);
		}

		this.notify();
		return reversed;
	}

	async clear(): Promise<void> {
		this.entries = [];
		if (this.options.store) {
			await this.options.store.clear();
		}
		this.notify();
	}

	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private notify(): void {
		for (const listener of this.listeners) {
			try {
				listener();
			} catch (e) {
				console.error("Error in WorkspaceJournal listener:", e);
			}
		}
	}
}

async function fingerprintReceipt(
	receipt: ScratchpadExecutionReceipt,
): Promise<string> {
	const canonical = JSON.stringify(
		canonicalize({
			lineNumber: receipt.lineNumber,
			rawText: receipt.rawText,
			macroId: receipt.macroId,
			invokedAs: receipt.invokedAs,
			success: receipt.success,
			result: receipt.result,
			error: receipt.error,
			identity: receipt.identity,
			executedAt: receipt.executedAt,
		}),
	);
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(canonical),
	);
	return Array.from(new Uint8Array(digest), (byte) =>
		byte.toString(16).padStart(2, "0"),
	).join("");
}

function canonicalize(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(canonicalize);
	if (value && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value as Record<string, unknown>)
				.sort(([left], [right]) => left.localeCompare(right))
				.map(([key, item]) => [key, canonicalize(item)]),
		);
	}
	return value;
}
