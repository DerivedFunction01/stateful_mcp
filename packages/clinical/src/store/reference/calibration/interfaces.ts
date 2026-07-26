export interface CalibrationException {
	exceptionId: string;
	personnelId: string;
	rawTerm: string;
	contextSnippet?: string;
	suggestedConceptId?: string;
	status: "pending" | "mapped" | "ignored";
	createdAt: string;
}

export interface CalibrationExceptionStore {
	get(exceptionId: string): Promise<CalibrationException | null>;
	list(): Promise<CalibrationException[]>;
	listPending(personnelId?: string): Promise<CalibrationException[]>;
	logException(
		exception: Omit<
			CalibrationException,
			"exceptionId" | "createdAt" | "status"
		>,
	): Promise<string>;
	resolve(
		exceptionId: string,
		status: "mapped" | "ignored",
		conceptId?: string,
	): Promise<void>;
	delete(exceptionId: string): Promise<void>;
}
