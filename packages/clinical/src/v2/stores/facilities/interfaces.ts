export interface Facility {
	facilityId: string;
	facilityCode: string;
	facilityName: string;
	jurisdictionCode: string;
}

export interface FacilityStore {
	get(facilityId: string): Promise<Facility | null>;
	list(): Promise<Facility[]>;
	set(facility: Facility): Promise<void>;
	delete(facilityId: string): Promise<void>;
}
