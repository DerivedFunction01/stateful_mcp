import type { KvBackend } from "@stateful-mcp/core";
import type {
	CalibrationException,
	CalibrationExceptionStore,
} from "./interfaces";

export class KvCalibrationExceptionStore
	implements CalibrationExceptionStore
{
	private readonly prefix = "calibrationException:";
	private readonly counterKey = "calibrationException:counter";

	constructor(private readonly backend: KvBackend) {}

	async get(exceptionId: string): Promise<CalibrationException | null> {
		const data = await this.backend.load();
		const value = data[this.prefix + exceptionId];
		return (value as CalibrationException | undefined) ?? null;
	}

	async list(): Promise<CalibrationException[]> {
		const data = await this.backend.load();
		return Object.entries(data)
			.filter(([k]) => k.startsWith(this.prefix) && k !== this.counterKey)
			.map(([, v]) => v as CalibrationException);
	}

	async listPending(personnelId?: string): Promise<CalibrationException[]> {
		const all = await this.list();
		return all.filter(
			(e) =>
				e.status === "pending" &&
				(!personnelId || e.personnelId === personnelId),
		);
	}

	async logException(
		exception: Omit<
			CalibrationException,
			"exceptionId" | "createdAt" | "status"
		>,
	): Promise<string> {
		const data = await this.backend.load();
		const counter = (data[this.counterKey] as number | undefined) ?? 0;
		const nextId = counter + 1;
		const exceptionId = `ce_${Date.now()}_${nextId}`;

		await this.backend.set(this.counterKey, nextId);
		await this.backend.set(this.prefix + exceptionId, {
			exceptionId,
			...exception,
			status: "pending",
			createdAt: new Date().toISOString(),
		} satisfies CalibrationException);
		await this.backend.save();

		return exceptionId;
	}

	async resolve(
		exceptionId: string,
		status: "mapped" | "ignored",
		conceptId?: string,
	): Promise<void> {
		const data = await this.backend.load();
		const existing = data[this.prefix + exceptionId] as
			| CalibrationException
			| undefined;
		if (!existing) return;

		await this.backend.set(this.prefix + exceptionId, {
			...existing,
			status,
			suggestedConceptId: conceptId ?? existing.suggestedConceptId,
		});
		await this.backend.save();
	}

	async delete(exceptionId: string): Promise<void> {
		await this.backend.delete(this.prefix + exceptionId);
		await this.backend.save();
	}
}
