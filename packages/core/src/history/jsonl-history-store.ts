import { readFile } from "node:fs/promises";
import { atomicWriteFile } from "./atomic-file";
import type { HistoryEvent, HistoryRecoveryDiagnostic } from "./contracts";
import { ValidatingHistoryStore, validateHistoryEvents } from "./history-store";

interface HistoryHeader {
	format: "stateful-history-jsonl";
	version: 1;
}

export class JsonlHistoryStore<
	TPayload = unknown,
> extends ValidatingHistoryStore<TPayload> {
	private loaded = false;
	readonly path: string;

	constructor(
		path: string | { path?: string; filePath?: string; dataFilePath?: string },
	) {
		super();
		this.path =
			typeof path === "string"
				? path
				: (path.path ?? path.filePath ?? path.dataFilePath ?? "");
		if (!this.path) throw new Error("A history file path is required");
	}

	protected async ensureLoaded(): Promise<void> {
		if (this.loaded) return;
		this.loaded = true;
		let raw: string;
		try {
			raw = await readFile(this.path, "utf8");
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") {
				this.diagnostics.push({
					code: "HISTORY_FILE_MISSING",
					message: `History file '${this.path}' does not exist`,
					recoverable: true,
				});
				return;
			}
			throw error;
		}
		const hasTrailingNewline = raw.endsWith("\n");
		const lines = raw.split("\n");
		if (lines.at(-1) === "") lines.pop();
		const events: HistoryEvent<TPayload>[] = [];
		const diagnostics: HistoryRecoveryDiagnostic[] = [];
		for (let index = 0; index < lines.length; index += 1) {
			const line = lines[index];
			if (!line?.trim()) continue;
			let parsed: unknown;
			try {
				parsed = JSON.parse(line);
			} catch {
				const partial = !hasTrailingNewline && index === lines.length - 1;
				diagnostics.push({
					code: partial ? "HISTORY_PARTIAL_RECORD" : "HISTORY_INVALID_JSON",
					message: partial
						? `History JSONL final line ${index + 1} is truncated`
						: `History JSONL line ${index + 1} is not valid JSON`,
					line: index + 1,
					recoverable: partial,
				});
				continue;
			}
			if (index === 0) {
				const header = parsed as Partial<HistoryHeader>;
				if (header.format !== "stateful-history-jsonl" || header.version !== 1)
					diagnostics.push({
						code: "HISTORY_VERSION_UNSUPPORTED",
						message: `Unsupported history JSONL header in '${this.path}'`,
						line: 1,
						recoverable: false,
					});
				else continue;
				continue;
			}
			if (isHistoryEvent(parsed)) events.push(parsed as HistoryEvent<TPayload>);
			else
				diagnostics.push({
					code: "HISTORY_INVALID_JSON",
					message: `History JSONL line ${index + 1} is not an event record`,
					line: index + 1,
					recoverable: false,
				});
		}
		const validation = validateHistoryEvents(events);
		this.replaceStreams(groupByStream(events), [...diagnostics, ...validation]);
	}

	protected async persist(): Promise<void> {
		const retained = this.diagnostics.filter(
			(item) => item.code !== "HISTORY_FILE_MISSING",
		);
		this.diagnostics.splice(0, this.diagnostics.length, ...retained);
		const lines = [
			JSON.stringify({ format: "stateful-history-jsonl", version: 1 }),
		];
		for (const events of this.streams.values())
			for (const event of events) lines.push(JSON.stringify(event));
		await atomicWriteFile(this.path, `${lines.join("\n")}\n`);
	}

	async reconcile(): Promise<void> {
		await this.ensureLoaded();
		await this.persist();
		const retained = this.diagnostics.filter(
			(item) => item.code !== "HISTORY_PARTIAL_RECORD",
		);
		this.diagnostics.splice(0, this.diagnostics.length, ...retained);
	}
}

function isHistoryEvent(value: unknown): value is HistoryEvent {
	if (!value || typeof value !== "object") return false;
	const item = value as Record<string, unknown>;
	return (
		typeof item.eventId === "string" &&
		typeof item.streamId === "string" &&
		typeof item.sequence === "number" &&
		Number.isInteger(item.sequence) &&
		item.sequence > 0 &&
		typeof item.eventType === "string" &&
		typeof item.occurredAt === "string" &&
		"payload" in item
	);
}

function groupByStream<TPayload>(
	events: HistoryEvent<TPayload>[],
): Map<string, HistoryEvent<TPayload>[]> {
	const result = new Map<string, HistoryEvent<TPayload>[]>();
	for (const event of events)
		result.set(event.streamId, [...(result.get(event.streamId) ?? []), event]);
	return result;
}
