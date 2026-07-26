import type { ParserSyntaxProfile } from "../interfaces";

export interface ParserProfileCoreStore {
	get(profileId: string): Promise<ParserSyntaxProfile | null>;
	list(): Promise<ParserSyntaxProfile[]>;
	set(profile: ParserSyntaxProfile): Promise<void>;
	delete(profileId: string): Promise<void>;
}

export interface ProfileTagStore {
	getProfileTags(profileId: string): Promise<string[]>;
	setProfileTags(profileId: string, tagIds: string[]): Promise<void>;
	deleteProfileTags(profileId: string, tagIds?: string[]): Promise<void>;
}
