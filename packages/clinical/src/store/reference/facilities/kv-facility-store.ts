import type { KvBackend } from "@stateful-mcp/core";
import type { Facility, FacilityStore } from "./interfaces";

export class KvFacilityStore implements FacilityStore {
	private readonly prefix = "facility:";

	constructor(private readonly backend: KvBackend) {}

	async get(facilityId: string): Promise<Facility | null> {
		const data = await this.backend.load();
		const value = data[this.prefix + facilityId];
		return (value as Facility | undefined) ?? null;
	}

	async list(): Promise<Facility[]> {
		const data = await this.backend.load();
		return Object.entries(data)
			.filter(([k]) => k.startsWith(this.prefix))
			.map(([, v]) => v as Facility);
	}

	async set(facility: Facility): Promise<void> {
		await this.backend.set(this.prefix + facility.facilityId, facility);
		await this.backend.save();
	}

	async delete(facilityId: string): Promise<void> {
		await this.backend.delete(this.prefix + facilityId);
		await this.backend.save();
	}
}
