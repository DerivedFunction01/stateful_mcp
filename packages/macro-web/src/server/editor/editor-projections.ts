import type { MacroDocument } from "@stateful-mcp/macro";
import type { MacroDiagnostic } from "@stateful-mcp/macro/contracts/input";
import type {
	DiagnosticDto,
	EditorDocumentDto,
	EditorJsonValue,
	EditorOutputIdentityDto,
	EditorOutputSnapshotDto,
	EditorPayloadEnvelope,
	ScratchpadExecutionPreviewDto,
	ScratchpadLineDto,
	ScratchpadLineStatus,
	ScratchpadProjectionDto,
	ScratchpadSnapshotDto,
} from "@stateful-mcp/macro-protocol";

/**
 * Canonical scratchpad diagnostics carry no severity of their own. A line is
 * either valid or invalid, and every diagnostic on an invalid line is an
 * error. Project the browser DTO explicitly instead of letting the host type
 * leak through an `as` cast.
 */
export function toScratchpadDiagnosticDto(
	diagnostic: MacroDiagnostic,
	isValid: boolean,
): DiagnosticDto {
	return {
		severity: isValid ? "info" : "error",
		message: diagnostic.message,
		code: diagnostic.code,
		...(diagnostic.start !== undefined && diagnostic.end !== undefined
			? {
					span: {
						start: diagnostic.start,
						end: diagnostic.end,
					},
				}
			: {}),
	};
}

export function toEditorJsonValue(
	value: unknown,
	seen: Set<object> = new Set<object>(),
	depth = 0,
): EditorJsonValue | undefined {
	if (depth > 8) return undefined;
	if (value === null) return null;
	if (typeof value === "string" || typeof value === "boolean") return value;
	if (typeof value === "number")
		return Number.isFinite(value) ? value : undefined;
	if (typeof value !== "object") return undefined;
	if (seen.has(value)) return undefined;
	seen.add(value);
	try {
		if (Array.isArray(value)) {
			const items = value.map((item) =>
				toEditorJsonValue(item, seen, depth + 1),
			);
			return items.every((item) => item !== undefined)
				? (items as EditorJsonValue[])
				: undefined;
		}
		const prototype = Object.getPrototypeOf(value);
		if (prototype !== Object.prototype && prototype !== null) return undefined;
		const entries = Object.entries(value).map(
			([key, item]) => [key, toEditorJsonValue(item, seen, depth + 1)] as const,
		);
		if (entries.some(([, item]) => item === undefined)) return undefined;
		return Object.fromEntries(entries) as EditorJsonValue;
	} finally {
		seen.delete(value);
	}
}

export function toEditorPayload(
	value: unknown,
	metadata: Pick<EditorPayloadEnvelope, "kind" | "ownerId"> &
		Partial<Pick<EditorPayloadEnvelope, "schemaVersion">>,
): EditorPayloadEnvelope {
	const data = toEditorJsonValue(value);
	if (data === undefined)
		return {
			...metadata,
			schemaVersion: metadata.schemaVersion ?? 1,
			availability: "unavailable",
			reasonCode: "EDITOR_PAYLOAD_UNAVAILABLE",
		};
	return {
		...metadata,
		schemaVersion: metadata.schemaVersion ?? 1,
		availability: "available",
		data,
	};
}

/**
 * Structural shape of a projected scratchpad line. It is a supertype of the
 * host's `ProjectedMacroLine` (the value returned by
 * `MacroDocument.session.getProjectedLines()`) so a projected line can be
 * passed in directly, while keeping this projection module free of non-exported
 * host internals.
 */
export interface ScratchpadLineProjection {
	readonly lineNumber: number;
	readonly rawText: string;
	readonly isValid: boolean;
	readonly isExecuted?: boolean;
	readonly macroName?: string;
	readonly projections: readonly {
		readonly macroId: string;
		readonly macroVersion: number;
	}[];
	readonly extensionProjections?: readonly {
		readonly ownerExtensionId: string;
		readonly data: unknown;
	}[];
	readonly preview?: { readonly text?: string };
	readonly executionPreview?: unknown;
	readonly diagnostics: readonly MacroDiagnostic[];
}

export function toScratchpadLineDto(
	line: ScratchpadLineProjection,
): ScratchpadLineDto {
	const lineStatus: ScratchpadLineStatus = !line.rawText.trim()
		? "empty"
		: !line.macroName
			? "non-macro"
			: line.isValid
				? "valid"
				: "invalid";
	const lineProjections: readonly ScratchpadProjectionDto[] = [
		...line.projections.map((projection) => ({
			kind: "slot" as const,
			ownerId: projection.macroId,
			version: projection.macroVersion,
			payload: toEditorPayload(projection, {
				kind: "slot",
				ownerId: projection.macroId,
				schemaVersion: 1,
			}),
		})),
		...(line.extensionProjections ?? []).map((projection) => ({
			kind: "extension" as const,
			ownerId: projection.ownerExtensionId,
			payload: toEditorPayload(projection.data, {
				kind: "extension",
				ownerId: projection.ownerExtensionId,
			}),
		})),
	];
	return {
		lineNumber: line.lineNumber,
		rawText: line.rawText,
		...(line.macroName ? { macroName: line.macroName } : {}),
		lineStatus,
		...(line.isExecuted !== undefined ? { isExecuted: line.isExecuted } : {}),
		diagnostics: line.diagnostics.map((diagnostic) =>
			toScratchpadDiagnosticDto(diagnostic, lineStatus === "valid"),
		),
		...(lineProjections.length > 0 ? { projections: lineProjections } : {}),
		...(line.preview ? { preview: { text: line.preview.text } } : {}),
		...(line.executionPreview
			? {
					executionPreview: {
						payload: toEditorPayload(line.executionPreview, {
							kind: "execution-preview",
						}),
					},
				}
			: {}),
	};
}

export function toEditorDocumentDto(
	document: MacroDocument,
): EditorDocumentDto {
	return {
		documentId: document.documentId,
		providerId: document.providerId,
		...(document.filePath ? { filePath: document.filePath } : {}),
		title: document.title,
		...(document.templateId ? { templateId: document.templateId } : {}),
		dirty: document.dirty,
		textRevision: document.textRevision,
		...(document.pinnedMacroIds?.length > 0
			? { pinnedMacroIds: document.pinnedMacroIds }
			: {}),
	};
}

export function toEditorDocumentSnapshot(
	document: MacroDocument,
): ScratchpadSnapshotDto {
	const projectedLines = document.session.getProjectedLines();
	const lines: readonly ScratchpadLineDto[] = projectedLines.map((line, idx) =>
		toScratchpadLineDto({
			...line,
			isExecuted: document.session.isLineExecuted(idx),
		}),
	);
	const projections: readonly ScratchpadProjectionDto[] =
		projectedLines.flatMap((line) => [
			...line.projections.map((projection) => ({
				kind: "slot" as const,
				ownerId: projection.macroId,
				version: projection.macroVersion,
				payload: toEditorPayload(projection, {
					kind: "slot",
					ownerId: projection.macroId,
					schemaVersion: 1,
				}),
			})),
			...(line.extensionProjections ?? []).map((projection) => ({
				kind: "extension" as const,
				ownerId: projection.ownerExtensionId,
				payload: toEditorPayload(projection.data, {
					kind: "extension",
					ownerId: projection.ownerExtensionId,
				}),
			})),
		]);
	const executionPreviews: readonly ScratchpadExecutionPreviewDto[] =
		projectedLines.flatMap((line) =>
			line.executionPreview
				? [
						{
							payload: toEditorPayload(line.executionPreview, {
								kind: "execution-preview",
							}),
						},
					]
				: [],
		);
	return {
		documentId: document.documentId,
		textRevision: document.textRevision,
		lines,
		...(projections.length > 0 ? { projections } : {}),
		...(executionPreviews.length > 0 ? { executionPreviews } : {}),
	};
}

/**
 * Structural shape of a workspace journal entry. It is a supertype of the
 * host's `JournalEntry` so a journal can be passed in directly without
 * depending on the host's non-exported journal internals.
 */
export interface ScratchpadJournalEntry {
	readonly id: string;
	readonly availability?: "available" | "legacy";
	readonly identity?: EditorOutputIdentityDto;
	readonly lineNumber: number;
	readonly rawText: string;
	readonly macroId: string;
	readonly invokedAs?: string;
	readonly status: "committed" | "reversed" | "superseded" | string;
	readonly result: unknown;
	readonly success?: boolean;
	readonly errorCode?: string;
	readonly reversalReason?: string;
	readonly fingerprint: string;
	readonly executedAt: number;
}

export function toEditorOutput(journal: {
	getEntries(): readonly ScratchpadJournalEntry[];
}): EditorOutputSnapshotDto {
	const entries = journal.getEntries();
	const bounded = entries.slice(-100);
	return {
		entries: bounded.map((entry) => ({
			outputId: entry.id,
			availability: entry.availability ?? "legacy",
			...(entry.identity ? { identity: entry.identity } : {}),
			lineNumber: entry.lineNumber,
			rawText: entry.rawText,
			macroId: entry.macroId,
			...(entry.invokedAs ? { invokedAs: entry.invokedAs } : {}),
			status:
				entry.status === "reversed"
					? "reversed"
					: entry.success === false
						? "failed"
						: "committed",
			...(entry.result === undefined
				? {}
				: {
						result: toEditorPayload(entry.result, {
							kind: "journal-result",
							ownerId: entry.macroId,
						}),
					}),
			...(entry.errorCode ? { errorCode: entry.errorCode } : {}),
			...(entry.reversalReason ? { reversalReason: entry.reversalReason } : {}),
			fingerprint: entry.fingerprint,
			executedAt: entry.executedAt,
		})),
		hasMore: entries.length > bounded.length,
	};
}
