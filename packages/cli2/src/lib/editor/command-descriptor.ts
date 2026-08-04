export interface CommandDescriptor {
	verb: string;
	aliases: string[];
	group: string;
	descriptionKey?: string;
	argNames?: string[];
	argsRequired?: boolean[];
}
