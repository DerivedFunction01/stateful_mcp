export interface StopWordWordListStore {
	get(id: string): Promise<string[] | null>;
	list(): Promise<Array<{ id: string; words: string[] }>>;
	set(id: string, words: string[]): Promise<void>;
	delete(id: string): Promise<void>;
}
