import type { Facility, FacilityStore } from "./interfaces";

export class MemoryFacilityStore implements FacilityStore {
	private readonly facilities = new Map<string, Facility>();

	async get(facilityId: string): Promise<Facility | null> {
		return this.facilities.get(facilityId) ?? null;
	}

	async list(): Promise<Facility[]> {
		return Array.from(this.facilities.values()).map((f) => ({ ...f }));
	}

	async set(facility: Facility): Promise<void> {
		this.facilities.set(facility.facilityId, { ...facility });
	}

	async delete(facilityId: string): Promise<void> {
		this.facilities.delete(facilityId);
	}
}
