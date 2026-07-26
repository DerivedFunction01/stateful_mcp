import type { Personnel, PersonnelStore } from "./interfaces";

export class MemoryPersonnelStore implements PersonnelStore {
	private readonly personnel = new Map<string, Personnel>();

	async get(personnelId: string): Promise<Personnel | null> {
		return this.personnel.get(personnelId) ?? null;
	}

	async list(): Promise<Personnel[]> {
		return Array.from(this.personnel.values()).map((p) => ({ ...p }));
	}

	async set(personnel: Personnel): Promise<void> {
		this.personnel.set(personnel.personnelId, { ...personnel });
	}

	async delete(personnelId: string): Promise<void> {
		this.personnel.delete(personnelId);
	}
}
