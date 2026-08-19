export interface CommandArgumentDto {
	readonly name: string;
	readonly required?: boolean;
	readonly description?: string;
	readonly type?: "enum" | "identifier" | "expression" | "text";
	readonly completions?: readonly string[];
}

export interface CommandDescriptorDto {
	readonly id: string;
	readonly title: string;
	readonly verb?: string;
	readonly aliases?: readonly string[];
	readonly category?: string;
	readonly description?: string;
	readonly keybinding?: string;
	readonly args?: readonly CommandArgumentDto[];
	readonly extensionId?: string;
}

export interface ExecuteCommandPayload {
	readonly command: string;
	readonly args?: readonly unknown[];
	readonly expectedRevision?: number;
}

export interface CommandResultDto {
	readonly command: string;
	readonly result?: unknown;
}
