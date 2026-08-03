import type { ParserCommandMacroStore, CommandFieldMetadata } from "../../store/parser/command-macros/interfaces";

export interface CommandFieldMetadataStore {
	list(context?: { personnelId?: string; profileId?: string }): Promise<CommandFieldMetadata[]>;
	get(roleName: string, context?: { personnelId?: string; profileId?: string }): Promise<CommandFieldMetadata | null>;
}

function valueKind(argument: { extraction: { kind: string } }): CommandFieldMetadata["valueKind"] {
	switch (argument.extraction.kind) {
		case "concept": return "concept";
		case "measurement": return "quantity";
		case "temporal": return "temporal";
		case "array": return "array";
		case "prose": return "prose";
		default: return "scalar";
	}
}

export class CommandMacroFieldMetadataCatalog implements CommandFieldMetadataStore {
	constructor(private readonly macroStore: ParserCommandMacroStore) {}

	async list(context?: { personnelId?: string; profileId?: string }): Promise<CommandFieldMetadata[]> {
		const macros = await this.macroStore.list(context);
		const fields = new Map<string, CommandFieldMetadata>();
		for (const macro of macros) {
			for (const argument of macro.arguments) {
				const metadata: CommandFieldMetadata = {
					roleName: argument.roleName,
					targetSchema: argument.target.targetSchema,
					targetPath: argument.target.targetPath,
					aliases: argument.aliases,
					valueKind: valueKind(argument),
					cardinality: argument.extraction.kind === "array" ? "many" : "one",
					required: argument.required,
					hint: argument.name,
				};
				const existing = fields.get(argument.roleName);
				fields.set(argument.roleName, existing ? {
					...existing,
					aliases: [...new Set([...(existing.aliases ?? []), ...(metadata.aliases ?? [])])],
					required: existing.required || metadata.required,
				} : metadata);
			}
		}
		return [...fields.values()].sort((left, right) => left.roleName.localeCompare(right.roleName));
	}

	async get(roleName: string, context?: { personnelId?: string; profileId?: string }): Promise<CommandFieldMetadata | null> {
		return (await this.list(context)).find((field) => field.roleName === roleName) ?? null;
	}
}
