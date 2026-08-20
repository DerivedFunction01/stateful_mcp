/**
 * Canonical editor mode vocabulary shared across host, protocol, and browser
 * runtimes. It is defined here (the dependency-free protocol package) so browser
 * code can consume it without importing Macro's Bun/runtime root.
 *
 * `COMMAND` is a separate mode, not a folded `NORMAL` state. Entering `:` changes
 * the input owner to the command line, changes which bindings are active, and has
 * distinct Enter/Escape/submission transitions.
 */
export type EditorMode = "NORMAL" | "INSERT" | "VISUAL" | "COMMAND";

export type MacroDocumentProviderId = "macro.text";

export type ScratchpadLineStatus = "empty" | "valid" | "invalid" | "non-macro";

export type EditorJsonValue =
	| null
	| boolean
	| number
	| string
	| readonly EditorJsonValue[]
	| { readonly [key: string]: EditorJsonValue };

export type EditorPayloadAvailability =
	| "available"
	| "unavailable"
	| "redacted";

export interface EditorPayloadEnvelope {
	readonly ownerId?: string;
	readonly kind: string;
	readonly schemaVersion: number;
	readonly availability: EditorPayloadAvailability;
	readonly data?: EditorJsonValue;
	readonly reasonCode?: string;
}

export interface ScratchpadProjectionDto {
	readonly kind: "slot" | "extension";
	readonly ownerId?: string;
	readonly version?: number;
	readonly payload: EditorPayloadEnvelope;
}

export interface ScratchpadExecutionPreviewDto {
	readonly text?: string;
	readonly payload?: EditorPayloadEnvelope;
}

export interface ScratchpadLineDto {
	readonly lineNumber: number;
	readonly rawText: string;
	readonly macroName?: string;
	readonly lineStatus: ScratchpadLineStatus;
	readonly diagnostics: readonly import("./workspace").DiagnosticDto[];
	readonly projections?: readonly ScratchpadProjectionDto[];
	readonly preview?: ScratchpadExecutionPreviewDto;
	readonly executionPreview?: ScratchpadExecutionPreviewDto;
}

export interface EditorDocumentDto {
	readonly documentId: string;
	readonly providerId: MacroDocumentProviderId;
	readonly title: string;
	readonly templateId?: string;
	readonly dirty: boolean;
	readonly textRevision: number;
	readonly pinnedMacroIds?: readonly string[];
}

export interface ScratchpadSnapshotDto {
	readonly documentId: string;
	readonly text: string;
	readonly textRevision: number;
	readonly lines: readonly ScratchpadLineDto[];
	readonly projections?: readonly ScratchpadProjectionDto[];
	readonly executionPreviews?: readonly ScratchpadExecutionPreviewDto[];
}

export interface ScratchpadTemplateDescriptor {
	readonly templateId: string;
	readonly providerId: MacroDocumentProviderId;
	readonly title: string;
	readonly description?: string;
	readonly pinnedMacroIds?: readonly string[];
	readonly sourceExtensionId?: string;
	readonly requiresProfile?: boolean;
}

export interface EditorWorkspaceSnapshotDto {
	readonly documents: readonly EditorDocumentDto[];
	readonly activeDocumentId: string | null;
	readonly activeDocument: ScratchpadSnapshotDto | null;
	readonly templates: readonly ScratchpadTemplateDescriptor[];
	readonly capabilities: {
		readonly canCreate: boolean;
		readonly canExecute: boolean;
		readonly canPersist: boolean;
	};
}

export interface EditorRequestBase {
	readonly requestId: string;
}

export type EditorOperation =
	| (EditorRequestBase & {
			readonly operation: "editor.newScratchpad";
	  })
	| (EditorRequestBase & {
			readonly operation: "editor.newScratchpadFromTemplate";
			readonly templateId: string;
	  })
	| (EditorRequestBase & {
			readonly operation: "editor.selectDocument";
			readonly documentId: string;
	  })
	| (EditorRequestBase & {
			readonly operation: "editor.closeDocument";
			readonly documentId: string;
			readonly expectedTextRevision?: number;
			readonly force?: boolean;
	  })
	| (EditorRequestBase & {
			readonly operation: "editor.renameDocument";
			readonly documentId: string;
			readonly title: string;
	  })
	| (EditorRequestBase & {
			readonly operation: "editor.pinMacro";
			readonly documentId: string;
			readonly macroId: string | null;
	  })
	| (EditorRequestBase & {
			readonly operation: "editor.replaceText";
			readonly documentId: string;
			readonly text: string;
			readonly expectedTextRevision: number;
	  })
	| (EditorRequestBase & {
			readonly operation: "editor.previewLine";
			readonly documentId: string;
			readonly lineNumber: number;
			readonly expectedTextRevision: number;
	  })
	| (EditorRequestBase & {
			readonly operation: "editor.previewRange";
			readonly documentId: string;
			readonly startLine: number;
			readonly endLine: number;
			readonly expectedTextRevision: number;
	  })
	| (EditorRequestBase & {
			readonly operation: "editor.previewDocument";
			readonly documentId: string;
			readonly expectedTextRevision: number;
	  })
	| (EditorRequestBase & {
			readonly operation: "editor.executeLine";
			readonly documentId: string;
			readonly lineNumber: number;
			readonly expectedTextRevision: number;
	  })
	| (EditorRequestBase & {
			readonly operation: "editor.executeRange";
			readonly documentId: string;
			readonly startLine: number;
			readonly endLine: number;
			readonly expectedTextRevision: number;
	  })
	| (EditorRequestBase & {
			readonly operation: "editor.executeValidLines";
			readonly documentId: string;
			readonly expectedTextRevision: number;
	  });

export interface ScratchpadExecutionReceiptDto {
	readonly documentId: string;
	readonly requestId: string;
	readonly textRevision: number;
	readonly lineNumber: number;
	readonly rawText: string;
	readonly macroName: string;
	readonly success: boolean;
	readonly result?: EditorPayloadEnvelope;
	readonly error?: string;
	readonly errorCode?: string;
	readonly executedAt: number;
}

export interface EditorSkippedLineDto {
	readonly lineNumber: number;
	readonly lineStatus: ScratchpadLineStatus;
	readonly reasonCode: string;
}

export interface EditorOperationResultBase {
	readonly operation: EditorOperation["operation"];
	readonly requestId: string;
	readonly snapshot: EditorWorkspaceSnapshotDto;
	readonly workspaceSnapshot?: import("./workspace").WorkspaceSnapshot;
	readonly workspaceRevision: number;
	readonly documentId?: string;
	readonly textRevision?: number;
	readonly code?: string;
	readonly message?: string;
}

export type EditorOperationResult =
	| (EditorOperationResultBase & {
			readonly status: "accepted";
			readonly receipts?: readonly ScratchpadExecutionReceiptDto[];
			readonly skippedLines?: readonly EditorSkippedLineDto[];
	  })
	| (EditorOperationResultBase & {
			readonly status: "preview";
			readonly lines: readonly ScratchpadLineDto[];
	  })
	| (EditorOperationResultBase & {
			readonly status: "rejected";
			readonly receipts?: readonly ScratchpadExecutionReceiptDto[];
			readonly skippedLines?: readonly EditorSkippedLineDto[];
	  })
	| (EditorOperationResultBase & {
			readonly status: "conflict";
			readonly expectedTextRevision?: number;
			readonly actualTextRevision?: number;
			readonly receipts?: readonly ScratchpadExecutionReceiptDto[];
			readonly skippedLines?: readonly EditorSkippedLineDto[];
	  });
