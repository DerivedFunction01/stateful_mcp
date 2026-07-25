export interface KvBackend {
	load(): Promise<Record<string, unknown>>;
	set(key: string, value: unknown): Promise<void>;
	delete(key: string): Promise<void>;
	save(): Promise<void>;
}
