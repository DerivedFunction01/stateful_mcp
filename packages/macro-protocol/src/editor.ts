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

export type SearchDirection = "forward" | "backward";
export type InsertPosition = "above" | "below";

export type MacroDocumentProviderId =
	| "macro.text"
	| "file"
	| "scratchpad"
	| "macro.template";

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

export interface MacroDisplayFacetsDto {
	readonly text?: string;
	readonly data?: EditorJsonValue;
	readonly markdown?: string;
	readonly table?: {
		readonly headers: readonly string[];
		readonly rows: readonly (readonly EditorJsonValue[])[];
	};
}

export interface MacroArtifactDescriptorDto {
	readonly id: string;
	readonly name: string;
	readonly mimeType: string;
	readonly sizeBytes?: number;
	readonly targetPath?: string;
	readonly downloadUrl?: string;
	readonly previewSnippet?: string;
	readonly artifactToken?: string;
	readonly lifecycle?: "ephemeral" | "project" | "extension" | "external";
	readonly scope?: "project" | "global" | "content" | "cache" | "external";
	readonly capabilities?: readonly ("download" | "save" | "open")[];
}

export interface GatedActionDescriptorDto {
	readonly actionId: string;
	readonly label: string;
	readonly referenceId?: string;
	readonly kind?: "download" | "invoke" | "view" | "external";
	readonly requiresPermissionCheck?: boolean;
	readonly expiresAt?: number;
}

export interface MacroExecutionPayloadDto {
	readonly facets?: MacroDisplayFacetsDto;
	readonly artifacts?: readonly MacroArtifactDescriptorDto[];
	readonly gatedActions?: readonly GatedActionDescriptorDto[];
}

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
	/**
	 * Hidden default macro id for this cell, if any. Not persisted as visible
	 * text.
	 */
	readonly defaultMacroId?: string;
	/**
	 * Effective macro used for parsing/execution. May differ from `macroName`
	 * (explicit) when a cell default applies.
	 */
	readonly effectiveMacroName?: string;
	/**
	 * How the effective macro was resolved for this cell.
	 */
	readonly macroResolution?: "explicit" | "default" | "none";
	/**
	 * Display-only placeholder for empty cells that have a default. Never
	 * persisted or parsed as user text.
	 */
	readonly placeholder?: string;
	readonly lineStatus: ScratchpadLineStatus;
	readonly isExecuted?: boolean;
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
	readonly filePath?: string;
	readonly dirty: boolean;
	readonly textRevision: number;
}

export interface EditorGroupDto {
	readonly groupId: string;
	readonly documentIds: readonly string[];
	readonly activeDocumentId: string | null;
	readonly orientation: "horizontal" | "vertical";
	readonly sizeRatio?: number;
}

export interface EditorLayoutLeafDto {
	readonly kind: "group";
	readonly groupId: string;
	readonly documentIds: readonly string[];
	readonly activeDocumentId: string | null;
}

export interface EditorLayoutSplitDto {
	readonly kind: "split";
	readonly nodeId: string;
	readonly orientation: "horizontal" | "vertical";
	readonly children: readonly EditorLayoutNodeDto[];
	readonly sizeRatios?: readonly number[];
}

export type EditorLayoutNodeDto = EditorLayoutLeafDto | EditorLayoutSplitDto;

export interface EditorLayoutDto {
	readonly version: 1;
	readonly root: EditorLayoutNodeDto;
}

export interface EditorOutputIdentityDto {
	readonly documentId: string;
	readonly requestId: string;
	readonly operation:
		| "editor.executeLine"
		| "editor.executeRange"
		| "editor.executeValidLines";
	readonly textRevision: number;
}

export interface EditorOutputEntryDto {
	readonly outputId: string;
	readonly availability: "available" | "legacy";
	readonly identity?: EditorOutputIdentityDto;
	readonly lineNumber?: number;
	readonly rawText?: string;
	readonly macroId?: string;
	readonly invokedAs?: string;
	readonly status: "preview" | "committed" | "skipped" | "failed" | "reversed";
	readonly result?: EditorPayloadEnvelope;
	readonly errorCode?: string;
	readonly reversalReason?: string;
	readonly fingerprint?: string;
	readonly executedAt: number;
}

export interface EditorOutputSnapshotDto {
	readonly entries: readonly EditorOutputEntryDto[];
	readonly hasMore: boolean;
}

export interface ScratchpadSnapshotDto {
	readonly documentId: string;
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
	/** Per-cell hidden defaults, keyed by 1-based line number. */
	readonly cellDefaults?: readonly {
		readonly lineNumber: number;
		readonly defaultMacroId: string;
	}[];
	readonly sourceExtensionId?: string;
	readonly requiresProfile?: boolean;
	readonly initialText?: string;
	readonly tags?: readonly string[];
	readonly source?: "extension" | "project" | "user";
	readonly isReadonly?: boolean;
	/**
	 * Keys of slot arguments that are fixed literal constants across all instances
	 * of this template. All other parsed arguments are treated as fillable placeholders.
	 * Format: `"<macroName>/<argKey>"`, e.g. `"patient/dept"` or `"vitals/facility"`.
	 */
	readonly templateLiteralArgs?: readonly string[];
}

export interface EditorWorkspaceSnapshotDto {
	readonly documents: readonly EditorDocumentDto[];
	readonly groups: readonly EditorGroupDto[];
	readonly editorLayout?: EditorLayoutDto;
	readonly activeGroupId: string | null;
	readonly activeDocumentId: string | null;
	readonly activeDocument: ScratchpadSnapshotDto | null;
	readonly loadedDocuments?: Readonly<Record<string, ScratchpadSnapshotDto>>;
	readonly templates: readonly ScratchpadTemplateDescriptor[];
	readonly output?: EditorOutputSnapshotDto;
	readonly capabilities: {
		readonly canCreate: boolean;
		readonly canExecute: boolean;
		readonly canPersist: boolean;
		readonly canSplit: boolean;
		readonly canUseVim: boolean;
	};
}

export interface EditorRequestBase {
	readonly requestId: string;
}

export type EditorOperation =
	| (EditorRequestBase & {
			readonly operation: "editor.newScratchpad";
			readonly groupId?: string;
			readonly expectedWorkspaceRevision?: number;
	  })
	| (EditorRequestBase & {
			readonly operation: "editor.newScratchpadFromTemplate";
			readonly templateId: string;
			readonly groupId?: string;
			readonly expectedWorkspaceRevision?: number;
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
			readonly operation: "editor.closeDocumentInGroup";
			readonly groupId: string;
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
			readonly operation: "editor.setCellDefault";
			readonly documentId: string;
			readonly lineNumber: number;
			readonly defaultMacroId: string | null;
			readonly expectedTextRevision: number;
	  })
	| (EditorRequestBase & {
			readonly operation: "editor.replaceText";
			readonly documentId: string;
			readonly lines: readonly string[];
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
	  })
	| (EditorRequestBase & {
			readonly operation: "editor.clearExecutedLines";
			readonly documentId: string;
			readonly expectedTextRevision?: number;
	  })
	| (EditorRequestBase & {
			readonly operation: "editor.resetExecutionState";
			readonly documentId: string;
	  })
	| (EditorRequestBase & {
			readonly operation: "editor.duplicateDocument";
			readonly documentId: string;
			readonly title?: string;
			readonly expectedWorkspaceRevision?: number;
	  })
	| (EditorRequestBase & {
			readonly operation: "editor.createSplitGroup";
			readonly sourceGroupId?: string;
			readonly documentId?: string;
			readonly moveDocument?: boolean;
			readonly behavior?: "duplicate" | "empty";
			readonly orientation?: "horizontal" | "vertical";
			readonly expectedWorkspaceRevision?: number;
	  })
	| (EditorRequestBase & {
			readonly operation: "editor.resizeSplit";
			readonly nodeId: string;
			readonly ratios: readonly number[];
			readonly expectedWorkspaceRevision?: number;
	  })
	| (EditorRequestBase & {
			readonly operation: "editor.closeGroup";
			readonly groupId: string;
			readonly expectedWorkspaceRevision?: number;
	  })
	| (EditorRequestBase & {
			readonly operation: "editor.focusGroup";
			readonly groupId: string;
			readonly expectedWorkspaceRevision?: number;
	  })
	| (EditorRequestBase & {
			readonly operation: "editor.openDocumentInGroup";
			readonly groupId: string;
			readonly documentId: string;
			readonly expectedWorkspaceRevision?: number;
	  })
	| (EditorRequestBase & {
			readonly operation: "editor.moveDocumentToGroup";
			readonly documentId: string;
			readonly groupId: string;
			readonly expectedWorkspaceRevision?: number;
	  })
	| (EditorRequestBase & {
			readonly operation: "editor.openFile";
			readonly path: string;
			readonly groupId?: string;
			readonly expectedWorkspaceRevision?: number;
	  })
	| (EditorRequestBase & {
			readonly operation: "editor.save";
			readonly documentId: string;
			readonly expectedTextRevision?: number;
			readonly force?: boolean;
	  })
	| (EditorRequestBase & {
			readonly operation: "editor.saveScratchpad";
			readonly documentId: string;
			readonly scratchpadId?: string;
			readonly title?: string;
			readonly expectedTextRevision?: number;
	  })
	| (EditorRequestBase & {
			readonly operation: "editor.openScratchpad";
			readonly scratchpadId: string;
			readonly expectedWorkspaceRevision?: number;
	  })
	| (EditorRequestBase & {
			readonly operation: "editor.openResource";
			readonly resourceKind: string;
			readonly resourceId: string;
			readonly groupId?: string;
			readonly expectedWorkspaceRevision?: number;
	  })
	| (EditorRequestBase & {
			readonly operation: "editor.resourceAction";
			readonly resourceKind: string;
			readonly resourceId: string;
			readonly action: string;
			readonly args?: readonly EditorJsonValue[];
			readonly expectedWorkspaceRevision?: number;
	  })
	| (EditorRequestBase & {
			readonly operation: "editor.saveArtifact";
			readonly artifactToken: string;
			readonly expectedWorkspaceRevision?: number;
	  })
	| (EditorRequestBase & {
			readonly operation: "editor.deleteScratchpad";
			readonly scratchpadId: string;
	  })
	| (EditorRequestBase & {
			readonly operation: "editor.saveTemplate";
			readonly template: ScratchpadTemplateDescriptor;
			readonly scope: "project" | "user";
	  })
	| (EditorRequestBase & {
			readonly operation: "editor.deleteTemplate";
			readonly templateId: string;
			readonly scope: "project" | "user";
	  })
	| (EditorRequestBase & {
			readonly operation: "editor.openTemplateAsDocument";
			readonly templateId: string;
			readonly groupId?: string;
	  })
	| (EditorRequestBase & {
			readonly operation: "editor.updateTemplateLiteralArgs";
			readonly templateId: string;
			readonly scope: "project" | "user";
			readonly literalArgs: readonly string[];
	  });

export interface ScratchpadExecutionReceiptDto {
	readonly documentId: string;
	readonly requestId: string;
	readonly textRevision: number;
	readonly lineNumber: number;
	readonly rawText: string;
	readonly macroId: string;
	readonly invokedAs?: string;
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
	readonly path?: string;
	readonly groupId?: string;
	readonly textRevision?: number;
	readonly expectedWorkspaceRevision?: number;
	readonly actualWorkspaceRevision?: number;
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
