import type {
	CalibrationException,
	CalibrationExceptionStore,
} from "./interfaces";

export class MemoryCalibrationExceptionStore
	implements CalibrationExceptionStore
{
	private readonly exceptions = new Map<string, CalibrationException>();

	async get(exceptionId: string): Promise<CalibrationException | null> {
		return this.exceptions.get(exceptionId) ?? null;
	}

	async list(): Promise<CalibrationException[]> {
		return Array.from(this.exceptions.values()).map((e) => ({ ...e }));
	}

	async listPending(personnelId?: string): Promise<CalibrationException[]> {
		return Array.from(this.exceptions.values())
			.filter(
				(e) =>
					e.status === "pending" &&
					(!personnelId || e.personnelId === personnelId),
			)
			.map((e) => ({ ...e }));
	}

	async logException(
		exception: Omit<
			CalibrationException,
			"exceptionId" | "createdAt" | "status"
		>,
	): Promise<string> {
		const exceptionId = `ce_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
		this.exceptions.set(exceptionId, {
			exceptionId,
			...exception,
			status: "pending",
			createdAt: new Date().toISOString(),
		});
		return exceptionId;
	}

	async resolve(
		exceptionId: string,
		status: "mapped" | "ignored",
		conceptId?: string,
	): Promise<void> {
		const existing = this.exceptions.get(exceptionId);
		if (!existing) return;
		this.exceptions.set(exceptionId, {
			...existing,
			status,
			suggestedConceptId: conceptId ?? existing.suggestedConceptId,
		});
	}

	async delete(exceptionId: string): Promise<void> {
		this.exceptions.delete(exceptionId);
	}
}
