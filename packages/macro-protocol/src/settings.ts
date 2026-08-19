export interface SettingsSchemaEntryDto {
	readonly path: readonly string[];
	readonly type:
		| "boolean"
		| "number"
		| "string"
		| "enum"
		| "array"
		| "object"
		| "json"
		| "keymap";
	readonly title: string;
	readonly description?: string;
	readonly widget?: string;
	readonly category?: string;
	readonly group?: string;
	readonly order?: number;
	readonly placeholder?: string;
	readonly enumValues?: readonly string[];
	readonly enumOptions?: readonly {
		readonly id: string;
		readonly label: string;
		readonly description?: string;
		readonly meta?: string;
	}[];
	readonly min?: number;
	readonly max?: number;
	readonly step?: number;
	readonly sensitive?: boolean;
	readonly restartRequired?: boolean;
}

export interface SettingsDiagnosticDto {
	readonly severity: "error" | "warning";
	readonly path?: readonly string[];
	readonly message: string;
	readonly line?: number;
	readonly column?: number;
	readonly restartRequired?: boolean;
}

export interface SettingsSnapshotDto {
	readonly effective: Readonly<Record<string, unknown>>;
	readonly draft: Readonly<Record<string, unknown>>;
	readonly rawText: string;
	readonly schema: readonly SettingsSchemaEntryDto[];
	readonly diagnostics: readonly SettingsDiagnosticDto[];
	readonly dirty: boolean;
	readonly activeProfileId: string;
}

export type SettingsOperation =
	| {
			readonly operation: "set";
			readonly path: readonly string[];
			readonly value: unknown;
			readonly expectedRevision?: number;
	  }
	| {
			readonly operation: "replaceJson";
			readonly rawText: string;
			readonly expectedRevision?: number;
	  }
	| { readonly operation: "save"; readonly expectedRevision?: number }
	| { readonly operation: "discard"; readonly expectedRevision?: number }
	| { readonly operation: "reload"; readonly expectedRevision?: number }
	| {
			readonly operation: "profile.select";
			readonly profileId: string;
			readonly expectedRevision?: number;
	  };
