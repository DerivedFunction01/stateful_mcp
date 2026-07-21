export interface FormState {
	formId: string;
	parentFormId: string | null;
	schemaName: string;
	answers: Record<string, any>;
	skipped: string[];
	stale: Record<string, boolean>;
	timestamp: string;
}

export interface PersistedFormState extends FormState {
	owner: string; // "global" or "user:<id>"
}

export interface FormAnswerResult {
	form_id: string;
	next_questions: string[];
	revealed: string[];
	hidden: string[];
	stale: string[];
	complete: boolean;
}
