import type { KvBackend } from "@stateful-mcp/core";
import { KvQueryEngine } from "@stateful-mcp/core/adapters/engines/kv-query";
import type { QueryDefinition } from "@stateful-mcp/core/middleware/filter/types";
import type { PatientProfile } from "../../schemas/schemas-interface/patient";
import {
	type PatientSearchResult,
	type PatientStore,
	patientFromRow,
	patientProjection,
} from "./interfaces";

export class KvPatientStore implements PatientStore {
	private readonly engine: KvQueryEngine;
	private readonly prefix = "clinical_patients::";

	constructor(private readonly backend: KvBackend) {
		this.engine = new KvQueryEngine(backend);
	}

	private key(patientId: string) {
		return `${this.prefix}${patientId}`;
	}

	async get(patientId: string) {
		const data = await this.backend.load();
		const row = data[this.key(patientId)];
		return row && typeof row === "object"
			? patientFromRow(row as Record<string, unknown>)
			: null;
	}

	async getByMrn(mrn: string) {
		const result = await this.search({
			filters: [{ property: "mrn", operator: "eq", value: mrn }],
			limit: 1,
		});
		return result[0] ? this.get(result[0].patientId) : null;
	}

	async search(query: QueryDefinition): Promise<PatientSearchResult[]> {
		const rows = await this.engine.execute("clinical_patients", query);
		return rows.map((row) => {
			const value = row as Record<string, unknown>;
			return {
				patientId: String(value.patientId),
				mrn: String(value.mrn),
				displayName: String(value.displayName),
				administrativeGender:
					value.administrativeGender as PatientProfile["administrativeGender"],
				lifecycle: value.lifecycle as PatientProfile["lifecycle"],
				organismType: String(value.organismType),
			};
		});
	}

	async list() {
		const data = await this.backend.load();
		return Object.entries(data)
			.filter(([key]) => key.startsWith(this.prefix))
			.map(([, value]) => patientFromRow(value as Record<string, unknown>));
	}

	async set(patient: PatientProfile) {
		await this.backend.set(this.key(patient.id), patientProjection(patient));
		await this.backend.save();
	}

	async delete(patientId: string) {
		await this.backend.delete(this.key(patientId));
		await this.backend.save();
	}
}
