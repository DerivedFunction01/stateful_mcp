import type { KvBackend } from "@stateful-mcp/core";
import type { Personnel, PersonnelStore } from "./interfaces";

export class KvPersonnelStore implements PersonnelStore {
	private readonly prefix = "personnel:";

	constructor(private readonly backend: KvBackend) {}

	async get(personnelId: string): Promise<Personnel | null> {
		const data = await this.backend.load();
		const value = data[this.prefix + personnelId];
		return (value as Personnel | undefined) ?? null;
	}

	async list(): Promise<Personnel[]> {
		const data = await this.backend.load();
		return Object.entries(data)
			.filter(([k]) => k.startsWith(this.prefix))
			.map(([, v]) => v as Personnel);
	}

	async set(personnel: Personnel): Promise<void> {
		await this.backend.set(this.prefix + personnel.personnelId, personnel);
		await this.backend.save();
	}

	async delete(personnelId: string): Promise<void> {
		await this.backend.delete(this.prefix + personnelId);
		await this.backend.save();
	}
}
