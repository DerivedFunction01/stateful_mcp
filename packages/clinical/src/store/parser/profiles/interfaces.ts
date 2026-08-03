import type { ParserSyntaxProfile } from "../interfaces";

export interface ParserProfileCoreStore {
	get(profileId: string): Promise<ParserSyntaxProfile | null>;
	list(): Promise<ParserSyntaxProfile[]>;
	set(profile: ParserSyntaxProfile): Promise<void>;
	delete(profileId: string): Promise<void>;
}
