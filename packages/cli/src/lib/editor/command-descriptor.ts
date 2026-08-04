export interface CommandArgumentDescriptor {
	name: string;
	required?: boolean;
	descriptionKey?: string;
	completions?: readonly string[];
	type?: "enum" | "identifier" | "expression" | "text";
	providerKey?: string;
	dependsOn?: { argumentIndex: number };
}

export interface CommandDescriptor {
	verb: string;
	aliases: string[];
	group: string;
	descriptionKey?: string;
	commandId?: string;
	argNames?: string[];
	argsRequired?: boolean[];
	args?: CommandArgumentDescriptor[];
}

