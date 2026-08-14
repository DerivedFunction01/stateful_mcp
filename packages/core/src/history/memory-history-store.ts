import { ValidatingHistoryStore } from "./history-store";

export class MemoryHistoryStore<
	TPayload = unknown,
> extends ValidatingHistoryStore<TPayload> {
	protected async ensureLoaded(): Promise<void> {}
	protected async persist(): Promise<void> {}
}
