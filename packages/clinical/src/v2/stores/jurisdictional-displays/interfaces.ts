export interface JurisdictionalDisplay {
	conceptId: string;
	jurisdictionId: string;
	preferredDisplay: string;
	fullySpecifiedName: string;
	source: string;
}

export interface JurisdictionalDisplayStore {
	get(
		conceptId: string,
		jurisdictionId: string,
		source?: string,
	): Promise<JurisdictionalDisplay | null>;
	list(): Promise<JurisdictionalDisplay[]>;
	set(display: JurisdictionalDisplay): Promise<void>;
	delete(
		conceptId: string,
		jurisdictionId: string,
		source: string,
	): Promise<void>;
}
