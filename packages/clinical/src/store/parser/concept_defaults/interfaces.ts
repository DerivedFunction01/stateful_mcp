import type { ParserConceptDefault } from "../interfaces";

export interface ParserConceptDefaultStore {
	get(
		anchorConceptId: string,
		targetSchema: string,
	): Promise<ParserConceptDefault | null>;
	list(): Promise<ParserConceptDefault[]>;
	listBySchema(targetSchema: string): Promise<ParserConceptDefault[]>;
	set(record: ParserConceptDefault): Promise<void>;
	delete(anchorConceptId: string, targetSchema: string): Promise<void>;
}
