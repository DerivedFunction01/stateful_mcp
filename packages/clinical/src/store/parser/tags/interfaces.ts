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
