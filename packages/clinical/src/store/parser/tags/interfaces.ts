export interface TagRecord {
	tagId: string;
	tagName: string;
	tagBlob: string;
	source: string;
}

export interface TagStore {
	get(tagId: string): Promise<TagRecord | null>;
	list(): Promise<TagRecord[]>;
	set(record: TagRecord): Promise<void>;
	delete(tagId: string): Promise<void>;
}

/**
 * Structured metadata stored as JSON in `TagRecord.tagBlob`.
 * Used by command autocomplete to rank tag suggestions.
 */
export interface TagMetadata {
	/** Static weight (higher = more important), e.g. 1–100 */
	priority?: number;
	/** Coarse category: "observation", "vitals", "medication", "plan", "diagnostic" */
	domain?: string;
	/** Schemas this tag is commonly used after, e.g. ["ObservationEvent"] */
	affinitySchemas?: string[];
}

/**
 * Parse `tagBlob` JSON string into `TagMetadata`.
 * Returns empty object on parse failure (graceful degradation).
 */
export function parseTagMetadata(blob: string): TagMetadata {
	try {
		return JSON.parse(blob) as TagMetadata;
	} catch {
		return {};
	}
}
