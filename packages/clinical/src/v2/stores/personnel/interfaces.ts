export interface Personnel {
	personnelId: string;
	fullName: string;
	specialtyCode: string;
	facilityId: string;
}

export interface PersonnelStore {
	get(personnelId: string): Promise<Personnel | null>;
	list(): Promise<Personnel[]>;
	set(personnel: Personnel): Promise<void>;
	delete(personnelId: string): Promise<void>;
}
