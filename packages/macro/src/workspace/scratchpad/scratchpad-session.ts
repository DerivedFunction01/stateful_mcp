import type { ExtensionRuntime } from "../../extensions/runtime";
import { extractTokenChipsFromProjections } from "../editor/chips";
import type { EditorKernel } from "../editor/editor-kernel";
import {
	createEmptyProjectedLine,
	type ProjectedMacroLine,
	synthesizeProjectedLine,
} from "./live-projection";

export interface ScratchpadExecutionReceipt {
	readonly lineNumber: number;
	readonly rawText: string;
	readonly macroName: string;
	readonly success: boolean;
	readonly result?: unknown;
	readonly error?: string;
	readonly executedAt: number;
	readonly identity?: {
		readonly documentId: string;
		readonly requestId: string;
		readonly operation:
			| "editor.executeLine"
			| "editor.executeRange"
			| "editor.executeValidLines";
		readonly textRevision: number;
	};
}

export type ScratchpadLineStatus = "empty" | "valid" | "invalid" | "non-macro";

export interface ScratchpadSkippedLine {
	readonly lineNumber: number;
	readonly lineStatus: ScratchpadLineStatus;
	readonly reasonCode: string;
}

export interface ScratchpadExecutionBatchResult {
	readonly receipts: readonly ScratchpadExecutionReceipt[];
	readonly skippedLines: readonly ScratchpadSkippedLine[];
}

export class ScratchpadExecutionPolicyError extends Error {
	constructor(
		readonly code: "EDITOR_LINE_NOT_EXECUTABLE" | "EDITOR_RANGE_INVALID",
		readonly lineNumber?: number,
		readonly lineStatus?: ScratchpadLineStatus,
	) {
		super(code);
		this.name = "ScratchpadExecutionPolicyError";
	}
}

export interface PinnedMacroLineContext {
	readonly macroId: string;
	readonly macroName: string;
	readonly macroStartToken: string;
}

export interface PinnedMacroLineResult {
	readonly insertedText: string;
	readonly macroId: string;
}

export interface ScratchpadSessionOptions {
	readonly createPinnedLineSeed?: (context: PinnedMacroLineContext) => string;
}

export class ScratchpadSession {
	private projectedLines: ProjectedMacroLine[] = [];
	private pinnedMacroId: string | null = null;
	private parseDebounceTimer: ReturnType<typeof setTimeout> | null = null;
	private readonly listeners = new Set<() => void>();

	constructor(
		public readonly runtime: ExtensionRuntime,
		public readonly editor: EditorKernel,
		private readonly debounceMs = 50,
		private readonly options: ScratchpadSessionOptions = {},
	) {
		this.projectedLines = this.editor
			.getLines()
			.map((text, idx) => createEmptyProjectedLine(idx + 1, text));

		this.editor.subscribe(() => {
			this.scheduleParse();
		});

		// Initial parse
		this.parseAllLinesSync();
	}

	getPinnedMacro(): string | null {
		return this.pinnedMacroId;
	}

	setPinnedMacro(macroId: string | null): void {
		if (this.pinnedMacroId !== macroId) {
			this.pinnedMacroId = macroId;
			this.parseAllLinesSync();
		}
	}

	createPinnedMacroLine(): PinnedMacroLineResult | null {
		if (!this.pinnedMacroId) return null;
		const matching = this.runtime.adapters
			.list()
			.find(
				(adapter) =>
					adapter.adapter.definition.id === this.pinnedMacroId ||
					adapter.adapter.definition.name === this.pinnedMacroId,
			);
		if (!matching) return null;
		const macroId = matching.adapter.definition.id;
		const macroName = matching.adapter.definition.name;
		const context: PinnedMacroLineContext = {
			macroId,
			macroName,
			macroStartToken: this.runtime.context.syntax.macroStartToken,
		};
		const insertedText =
			this.options.createPinnedLineSeed?.(context) ??
			`${context.macroStartToken}${context.macroName} `;
		this.editor.splitLine();
		this.editor.insertText(insertedText);
		return { insertedText, macroId };
	}

	getProjectedLines(): readonly ProjectedMacroLine[] {
		return this.projectedLines;
	}

	getProjectedLine(lineIndex: number): ProjectedMacroLine | undefined {
		return this.projectedLines[lineIndex];
	}

	getLineStatus(lineIndex: number): ScratchpadLineStatus {
		const line = this.projectedLines[lineIndex];
		if (!line) return "non-macro";
		if (!line.rawText.trim()) return "empty";
		if (!line.macroName) return "non-macro";
		return line.isValid ? "valid" : "invalid";
	}

	getLineStatusByNumber(lineNumber: number): ScratchpadLineStatus {
		return this.getLineStatus(lineNumber - 1);
	}

	getValidLineCount(): number {
		return this.projectedLines.filter((l) => l.isValid).length;
	}

	getTotalLineCount(): number {
		return this.projectedLines.length;
	}

	async parseAllLines(): Promise<readonly ProjectedMacroLine[]> {
		const lines = this.editor.getLines();
		const registeredAdapters = this.runtime.adapters.list();
		const prefix = this.runtime.context.syntax.macroStartToken;

		const results = await Promise.all(
			lines.map(async (lineText, index) => {
				const trimmed = lineText.trim();
				if (!trimmed || registeredAdapters.length === 0) {
					return createEmptyProjectedLine(index + 1, lineText);
				}

				// 1. Explicit macro name match with strict word boundaries
				const matching = registeredAdapters.find((a) =>
					matchesMacroVerb(trimmed, a.adapter.definition.name, prefix),
				);

				if (!matching) {
					return createEmptyProjectedLine(index + 1, lineText);
				}

				const adapterId = matching.adapter.definition.id;
				const macroName = matching.adapter.definition.name;

				try {
					const parseText = matchesMacroVerb(trimmed, macroName, prefix)
						? lineText
						: prefix
							? `${prefix}${macroName} ${lineText}`
							: `${macroName} ${lineText}`;

					const draft = await this.runtime.parseAdapter(adapterId, parseText);
					if (!draft || !draft.input) {
						return {
							lineNumber: index + 1,
							rawText: lineText,
							macroName,
							adapterId,
							isValid: false,
							projections: draft?.projections ?? [],
							chips: extractTokenChipsFromProjections(draft?.projections ?? []),
							diagnostics: draft?.diagnostics ?? [
								{
									code: "NO_MATCH",
									message: `Failed to parse arguments for macro '${macroName}'`,
									severity: "error",
									span: { start: 0, end: lineText.length },
								},
							],
						};
					}

					return synthesizeProjectedLine(
						index + 1,
						lineText,
						draft.input.macroName,
						adapterId,
						draft.projections,
						draft.preview,
						draft.executionPreview,
						draft.diagnostics,
					);
				} catch (error) {
					return {
						lineNumber: index + 1,
						rawText: lineText,
						macroName,
						adapterId,
						isValid: false,
						projections: [],
						chips: [],
						diagnostics: [
							{
								code: "NO_MATCH" as const,
								message: error instanceof Error ? error.message : String(error),
								severity: "error" as const,
								span: { start: 0, end: lineText.length },
							},
						],
					};
				}
			}),
		);

		this.projectedLines = results;
		this.notify();
		return results;
	}

	private parseAllLinesSync(): void {
		void this.parseAllLines();
	}

	private scheduleParse(): void {
		if (this.parseDebounceTimer) {
			clearTimeout(this.parseDebounceTimer);
		}
		this.parseDebounceTimer = setTimeout(() => {
			void this.parseAllLines();
		}, this.debounceMs);
	}

	async executeLine(
		lineIndex: number,
	): Promise<ScratchpadExecutionReceipt | null> {
		const line = this.projectedLines[lineIndex];
		if (!line || !line.isValid || !line.adapterId || !line.macroName) {
			return null;
		}

		try {
			const prefix = this.runtime.context.syntax.macroStartToken;
			const trimmed = line.rawText.trim();
			const parseText = matchesMacroVerb(trimmed, line.macroName, prefix)
				? line.rawText
				: prefix
					? `${prefix}${line.macroName} ${line.rawText}`
					: `${line.macroName} ${line.rawText}`;

			const draft = await this.runtime.parseAdapter(line.adapterId, parseText);
			const result = await this.runtime.executeAdapter(line.adapterId, draft);
			return {
				lineNumber: line.lineNumber,
				rawText: line.rawText,
				macroName: line.macroName,
				success: true,
				result,
				executedAt: Date.now(),
			};
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			console.error(
				`Execution failed for scratchpad line ${line.lineNumber}:`,
				error,
			);
			return {
				lineNumber: line.lineNumber,
				rawText: line.rawText,
				macroName: line.macroName,
				success: false,
				error: errorMessage,
				executedAt: Date.now(),
			};
		}
	}

	async executeAllValidLines(): Promise<readonly ScratchpadExecutionReceipt[]> {
		const receipts: ScratchpadExecutionReceipt[] = [];
		for (let i = 0; i < this.projectedLines.length; i++) {
			const line = this.projectedLines[i];
			if (line?.isValid) {
				const receipt = await this.executeLine(i);
				if (receipt) {
					receipts.push(receipt);
				}
			}
		}
		return receipts;
	}

	async executeRange(
		startLine: number,
		endLine: number,
	): Promise<ScratchpadExecutionBatchResult> {
		this.assertRange(startLine, endLine);
		const skippedLines: ScratchpadSkippedLine[] = [];
		for (let lineNumber = startLine; lineNumber <= endLine; lineNumber++) {
			const lineStatus = this.getLineStatusByNumber(lineNumber);
			if (lineStatus === "empty") {
				skippedLines.push({
					lineNumber,
					lineStatus,
					reasonCode: "EDITOR_EMPTY_LINE_SKIPPED",
				});
				continue;
			}
			if (lineStatus !== "valid")
				throw new ScratchpadExecutionPolicyError(
					"EDITOR_LINE_NOT_EXECUTABLE",
					lineNumber,
					lineStatus,
				);
		}

		const receipts: ScratchpadExecutionReceipt[] = [];
		for (let lineNumber = startLine; lineNumber <= endLine; lineNumber++) {
			if (this.getLineStatusByNumber(lineNumber) !== "valid") continue;
			const receipt = await this.executeLine(lineNumber - 1);
			if (receipt) receipts.push(receipt);
		}
		return { receipts, skippedLines };
	}

	async executeValidLines(): Promise<ScratchpadExecutionBatchResult> {
		const skippedLines: ScratchpadSkippedLine[] = [];
		const receipts: ScratchpadExecutionReceipt[] = [];
		for (
			let lineNumber = 1;
			lineNumber <= this.getTotalLineCount();
			lineNumber++
		) {
			const lineStatus = this.getLineStatusByNumber(lineNumber);
			if (lineStatus !== "valid") {
				skippedLines.push({
					lineNumber,
					lineStatus,
					reasonCode:
						lineStatus === "empty"
							? "EDITOR_EMPTY_LINE_SKIPPED"
							: "EDITOR_LINE_NOT_EXECUTABLE_SKIPPED",
				});
				continue;
			}
			const receipt = await this.executeLine(lineNumber - 1);
			if (receipt) receipts.push(receipt);
		}
		return { receipts, skippedLines };
	}

	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private notify(): void {
		for (const listener of this.listeners) {
			try {
				listener();
			} catch (e) {
				console.error("Error in ScratchpadSession listener:", e);
			}
		}
	}

	private assertRange(startLine: number, endLine: number): void {
		if (
			!Number.isInteger(startLine) ||
			!Number.isInteger(endLine) ||
			startLine < 1 ||
			endLine < startLine ||
			endLine > this.getTotalLineCount()
		)
			throw new ScratchpadExecutionPolicyError("EDITOR_RANGE_INVALID");
	}
}

/**
 * Strictly tests if text starts with a macro verb without false substring matches.
 */
function matchesMacroVerb(
	trimmed: string,
	macroName: string,
	prefix: string,
): boolean {
	if (prefix && trimmed.startsWith(prefix)) {
		const withoutPrefix = trimmed.slice(prefix.length);
		return (
			withoutPrefix === macroName ||
			withoutPrefix.startsWith(`${macroName} `) ||
			withoutPrefix.startsWith(`${macroName}\t`) ||
			withoutPrefix.startsWith(`${macroName}\n`) ||
			withoutPrefix.startsWith(`${macroName}=`)
		);
	}

	return (
		trimmed === macroName ||
		trimmed.startsWith(`${macroName} `) ||
		trimmed.startsWith(`${macroName}\t`) ||
		trimmed.startsWith(`${macroName}\n`) ||
		trimmed.startsWith(`${macroName}=`)
	);
}
