export interface CommandDescriptor {
	verb: string;
	aliases: string[];
	group: string;
	descriptionKey?: string;
	argNames?: string[];
	argsRequired?: boolean[];
	args?: Array<{
		name: string;
		required?: boolean;
		descriptionKey?: string;
		completions?: unknown;
	}>;
}
