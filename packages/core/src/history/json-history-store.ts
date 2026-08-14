import { readFile } from "node:fs/promises";
import { atomicWriteFile } from "./atomic-file";
import type { HistoryEvent } from "./contracts";
import { ValidatingHistoryStore, validateHistoryEvents } from "./history-store";

interface HistoryEnvelope<TPayload> {
	format: "stateful-history";
	version: 1;
	streams: Record<
		string,
		{ nextSequence: number; events: HistoryEvent<TPayload>[] }
	>;
}

export class JsonHistoryStore<
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
		try {
			const envelope = JSON.parse(raw) as Partial<HistoryEnvelope<TPayload>>;
			if (envelope.format !== "stateful-history" || envelope.version !== 1) {
				this.diagnostics.push({
					code: "HISTORY_VERSION_UNSUPPORTED",
					message: `Unsupported history envelope in '${this.path}'`,
					recoverable: false,
				});
				return;
			}
			const streams = new Map<string, HistoryEvent<TPayload>[]>();
			for (const [streamId, value] of Object.entries(envelope.streams ?? {})) {
				const events = Array.isArray(value?.events) ? value.events : [];
				streams.set(streamId, events);
			}
			const events = [...streams.values()].flat();
			this.replaceStreams(streams, validateHistoryEvents(events));
		} catch {
			this.diagnostics.push({
				code: "HISTORY_INVALID_JSON",
				message: `History file '${this.path}' is not valid JSON`,
				recoverable: false,
			});
		}
	}

	protected async persist(): Promise<void> {
		this.removeMissingDiagnostic();
		const streams: HistoryEnvelope<TPayload>["streams"] = {};
		for (const [streamId, events] of this.streams)
			streams[streamId] = {
				nextSequence: Math.max(0, ...events.map((event) => event.sequence)) + 1,
				events,
			};
		await atomicWriteFile(
			this.path,
			JSON.stringify(
				{ format: "stateful-history", version: 1, streams },
				null,
				2,
			),
		);
	}

	private removeMissingDiagnostic(): void {
		const retained = this.diagnostics.filter(
			(item) => item.code !== "HISTORY_FILE_MISSING",
		);
		this.diagnostics.splice(0, this.diagnostics.length, ...retained);
	}
}
