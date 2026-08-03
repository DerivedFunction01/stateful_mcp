import type {
	StopWordProfile,
	StopWordStore,
	StopWordWordListRecord,
	StopWordWordListStore,
} from "../interfaces";

export type {
	StopWordProfile,
	StopWordStore,
	StopWordWordListRecord,
	StopWordWordListStore,
};

export interface StopWordProfileStore {
	get(profileId: string): Promise<StopWordProfile | null>;
	list(): Promise<StopWordProfile[]>;
	set(profile: StopWordProfile): Promise<void>;
	delete(profileId: string): Promise<void>;
}
