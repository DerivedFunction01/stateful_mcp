export type UnifiedProfileKind = "command" | "numerical" | "value" | "macro" | "dictionary";

export interface UnifiedProfileRecord {
	profileId: string;
	kind: UnifiedProfileKind;
	isDefault?: boolean;
	active?: boolean;
	metadata?: Record<string, unknown>;
	payload: unknown;
}

export interface UnifiedProfileStore {
	get(profileId: string): Promise<UnifiedProfileRecord | null>;
	list(): Promise<UnifiedProfileRecord[]>;
	set(profile: UnifiedProfileRecord): Promise<void>;
	delete(profileId: string): Promise<void>;
}
