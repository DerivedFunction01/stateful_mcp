import type {
	JsonValue,
	MessageDescriptor,
	MessageParam,
	PinnedMacroDto,
	StructuredError,
} from "@stateful-mcp/macro-protocol";
import { structuredError } from "@stateful-mcp/macro-protocol";
import type { MacroDiagnostic } from "../../contracts/input";
import type { ExtensionRuntime } from "../../extensions/runtime";
import { extractTokenChipsFromProjections } from "../editor/chips";
import type { EditorKernel } from "../editor/editor-kernel";
import { messageDescriptor } from "../i18n/translation";
import {
	createEmptyProjectedLine,
	type ProjectedMacroLine,
	synthesizeProjectedLine,
} from "./live-projection";

/**
 * Message keys for the diagnostics and failures this session synthesizes
 * itself. The session never produces prose or raw `Error.message` text: every
 * user-visible string is resolved from these keys by the presentation layer.
 */
const SCRATCHPAD_MESSAGE_KEYS = {
	parseFailed: "editor.diagnostics.parseFailed",
	parseError: "editor.diagnostics.parseError",
	executionFailed: "editor.execution.failed",
} as const;

export interface ScratchpadExecutionReceipt {
	readonly lineNumber: number;
	readonly rawText: string;
	readonly macroId: string;
	readonly invokedAs?: string;
	readonly success: boolean;
	readonly result?: unknown;
	/**
	 * Structured failure descriptor. Hosts localize `messageKey`; the raw
	 * thrown error stays on the developer console and never crosses this
	 * boundary.
	 */
	readonly error?: MessageDescriptor;
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
	readonly code: string;
	readonly messageKey: string;
	readonly messageParams?: Readonly<Record<string, MessageParam>>;
	readonly safeDetails?: Readonly<Record<string, JsonValue>>;

	constructor(options: {
		readonly code: string;
		readonly messageKey: string;
		readonly messageParams?: Readonly<Record<string, MessageParam>>;
		readonly safeDetails?: Readonly<Record<string, JsonValue>>;
	}) {
		super(options.messageKey);
		this.name = "ScratchpadExecutionPolicyError";
		this.code = options.code;
		this.messageKey = options.messageKey;
		this.messageParams = options.messageParams;
		this.safeDetails = options.safeDetails;
	}

	toHostError(): StructuredError {
		return structuredError({
			code: this.code,
			messageKey: this.messageKey,
			messageParams: this.messageParams,
			safeDetails: this.safeDetails,
		});
	}
}

export interface QuickRunContext {
	readonly macroId: string;
	readonly macroName: string;
	readonly macroStartToken: string;
}

export interface ScratchpadSessionOptions {
	/**
	 * Optional seed used when inserting a Quick Run snippet. Quick Runs insert
	 * explicit macro text and never assign a cell default.
	 */
	readonly createQuickRunSeed?: (context: QuickRunContext) => string;
}

export class ScratchpadSession {
	private projectedLines: ProjectedMacroLine[] = [];
	/** Per-cell hidden defaults keyed by 0-based line index. */
	private readonly cellDefaults = new Map<number, string>();
	private executedLineIndices = new Set<number>();
	private readonly macroFrequencies = new Map<string, number>();
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

	recordExecution(macroName: string): void {
		const current = this.macroFrequencies.get(macroName) ?? 0;
		this.macroFrequencies.set(macroName, current + 1);
	}

	getFrequentMacros(
		limit = 5,
	): readonly { macroName: string; count: number }[] {
		return [...this.macroFrequencies.entries()]
			.map(([macroName, count]) => ({ macroName, count }))
			.sort((a, b) => b.count - a.count)
			.slice(0, limit);
	}

	/**
	 * Build the list of insertable Quick Run snippets. Quick Runs are an
	 * independent convenience list and never assign a cell default.
	 */
	getQuickRuns(
		projectQuickRuns: readonly string[] = [],
	): readonly PinnedMacroDto[] {
		const result: PinnedMacroDto[] = [];
		const seen = new Set<string>();

		// 1. Project quick runs
		for (const name of projectQuickRuns) {
			if (!seen.has(name)) {
				seen.add(name);
				result.push({
					id: `project:${name}`,
					macroName: name,
					source: "project",
					snippet: `^${name} `,
				});
			}
		}

		// 2. Frequent macros from active session
		for (const { macroName, count } of this.getFrequentMacros()) {
			if (!seen.has(macroName)) {
				seen.add(macroName);
				result.push({
					id: `frequent:${macroName}`,
					macroName,
					source: "frequent",
					executionCount: count,
					snippet: `^${macroName} `,
				});
			}
		}

		// 3. Extension defaults
		for (const adapter of this.runtime.adapters.list()) {
			const name = adapter.adapter.definition.name;
			if (!seen.has(name)) {
				seen.add(name);
				result.push({
					id: `ext:${name}`,
					macroName: name,
					source: "extension",
					snippet: `^${name} `,
				});
			}
		}

		return result;
	}

	// ─── Cell default macros ──────────────────────────────────────────────

	getCellDefault(lineIndex: number): string | null {
		return this.cellDefaults.get(lineIndex) ?? null;
	}

	getCellDefaults(): ReadonlyMap<number, string> {
		return new Map(this.cellDefaults);
	}

	setCellDefault(lineIndex: number, macroId: string | null): void {
		if (macroId === null || macroId === "") {
			if (this.cellDefaults.delete(lineIndex)) this.parseAllLinesSync();
		} else if (this.cellDefaults.get(lineIndex) !== macroId) {
			this.cellDefaults.set(lineIndex, macroId);
			this.parseAllLinesSync();
		}
	}

	setCellDefaults(defaults: ReadonlyMap<number, string>): void {
		this.cellDefaults.clear();
		for (const [idx, id] of defaults) {
			if (id) this.cellDefaults.set(idx, id);
		}
		this.parseAllLinesSync();
	}

	clearCellDefaults(): void {
		if (this.cellDefaults.size === 0) return;
		this.cellDefaults.clear();
		this.parseAllLinesSync();
	}

	/**
	 * Keep cell default metadata aligned with structural line operations.
	 * A newly inserted line carries no default unless explicitly duplicated.
	 */
	shiftCellDefaultsAfterInsert(atIndex: number): void {
		if (atIndex < 0) return;
		const next = new Map<number, string>();
		for (const [idx, id] of this.cellDefaults) {
			next.set(idx >= atIndex ? idx + 1 : idx, id);
		}
		this.cellDefaults.clear();
		for (const [idx, id] of next) this.cellDefaults.set(idx, id);
	}

	shiftCellDefaultsAfterDelete(atIndex: number): void {
		if (atIndex < 0) return;
		const next = new Map<number, string>();
		for (const [idx, id] of this.cellDefaults) {
			if (idx === atIndex) continue;
			next.set(idx > atIndex ? idx - 1 : idx, id);
		}
		this.cellDefaults.clear();
		for (const [idx, id] of next) this.cellDefaults.set(idx, id);
		this.parseAllLinesSync();
	}

	duplicateCellDefault(atIndex: number): void {
		const id = this.cellDefaults.get(atIndex);
		if (id === undefined) return;
		this.cellDefaults.set(atIndex + 1, id);
		this.parseAllLinesSync();
	}

	moveCellDefault(fromIndex: number, toIndex: number): void {
		if (fromIndex === toIndex) return;
		const id = this.cellDefaults.get(fromIndex);
		const next = new Map<number, string>();
		for (const [idx, value] of this.cellDefaults) {
			if (idx === fromIndex) continue;
			next.set(idx > fromIndex ? idx - 1 : idx, value);
		}
		if (id !== undefined) {
			next.set(toIndex > fromIndex ? toIndex - 1 : toIndex, id);
		}
		this.cellDefaults.clear();
		for (const [idx, value] of next) this.cellDefaults.set(idx, value);
		this.parseAllLinesSync();
	}

	/**
	 * Insert explicit macro text for a Quick Run. A Quick Run never assigns a
	 * cell default: it only inserts visible snippet text into the editor buffer.
	 */
	insertQuickRun(macroId: string, args = ""): string | null {
		const matching = this.runtime.adapters
			.list()
			.find(
				(adapter) =>
					adapter.adapter.definition.id === macroId ||
					adapter.adapter.definition.name === macroId,
			);
		if (!matching) return null;
		const macroName = matching.adapter.definition.name;
		const context: QuickRunContext = {
			macroId: matching.adapter.definition.id,
			macroName,
			macroStartToken: this.runtime.context.syntax.macroStartToken,
		};
		const insertedText =
			this.options.createQuickRunSeed?.(context) ??
			`${context.macroStartToken}${context.macroName}${args ? ` ${args}` : ""} `;
		this.editor.splitLine();
		this.editor.insertText(insertedText);
		return insertedText;
	}

	isLineExecuted(lineIndex: number): boolean {
		return this.executedLineIndices.has(lineIndex);
	}

	getExecutedLineIndices(): readonly number[] {
		return Array.from(this.executedLineIndices);
	}

	markLineExecuted(lineIndex: number): void {
		this.executedLineIndices.add(lineIndex);
		this.notify();
	}

	clearExecutedLines(): void {
		if (this.executedLineIndices.size === 0) return;
		const currentLines = this.editor.getLines();
		const remaining = currentLines.filter(
			(_, idx) => !this.executedLineIndices.has(idx),
		);
		this.executedLineIndices.clear();
		this.editor.setLines(remaining.length > 0 ? remaining : [""]);
		this.notify();
	}

	resetExecutionState(): void {
		this.executedLineIndices.clear();
		this.notify();
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
		if (!line.macroName && !line.effectiveMacroName) return "non-macro";
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

		const findAdapter = (macroId: string | null | undefined) =>
			macroId
				? registeredAdapters.find(
						(a) =>
							a.adapter.definition.id === macroId ||
							a.adapter.definition.name === macroId,
					)
				: undefined;

		const results = await Promise.all(
			lines.map(async (lineText, index) => {
				const trimmed = lineText.trim();
				if (registeredAdapters.length === 0) {
					return createEmptyProjectedLine(index + 1, lineText);
				}

				// 1. Explicit macro syntax always wins over the hidden default.
				const explicit = registeredAdapters.find((a) =>
					matchesMacroVerb(trimmed, a.adapter.definition.name, prefix),
				);

				if (explicit) {
					const macroName = explicit.adapter.definition.name;
					const adapterId = explicit.adapter.definition.id;
					const defaultId = this.cellDefaults.get(index) ?? null;
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
								defaultMacroId: defaultId ?? undefined,
								effectiveMacroName: macroName,
								macroResolution: "explicit" as const,
								isValid: false,
								projections: draft?.projections ?? [],
								chips: extractTokenChipsFromProjections(
									draft?.projections ?? [],
								),
								diagnostics:
									draft?.diagnostics ??
									([
										scratchpadDiagnostic(
											SCRATCHPAD_MESSAGE_KEYS.parseFailed,
											macroName,
											lineText,
										),
									] as const),
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
							[],
							defaultId ?? undefined,
							macroName,
							"explicit",
						);
					} catch (error) {
						console.error(
							`Parse failed for scratchpad line ${index + 1}:`,
							error,
						);
						return {
							lineNumber: index + 1,
							rawText: lineText,
							macroName,
							adapterId,
							defaultMacroId: defaultId ?? undefined,
							effectiveMacroName: macroName,
							macroResolution: "explicit" as const,
							isValid: false,
							projections: [],
							chips: [],
							diagnostics: [
								scratchpadDiagnostic(
									SCRATCHPAD_MESSAGE_KEYS.parseError,
									macroName,
									lineText,
								),
							],
						};
					}
				}

				// 2. No explicit macro: fall back to the hidden cell default.
				const defaultId = this.cellDefaults.get(index) ?? null;
				const defaultAdapter = findAdapter(defaultId);
				if (defaultAdapter) {
					const macroName = defaultAdapter.adapter.definition.name;
					const adapterId = defaultAdapter.adapter.definition.id;
					const isEmpty = !trimmed;
					const placeholder = isEmpty ? `${prefix}${macroName} ` : undefined;
					// Empty defaulted cells render a display-only placeholder and are
					// not executable until arguments are supplied.
					if (isEmpty) {
						return synthesizeProjectedLine(
							index + 1,
							lineText,
							macroName,
							adapterId,
							[],
							undefined,
							undefined,
							[],
							[],
							defaultId ?? undefined,
							macroName,
							"default",
							placeholder,
						);
					}
					try {
						const parseText = `${prefix ? `${prefix}${macroName} ` : `${macroName} `}${lineText}`;
						const draft = await this.runtime.parseAdapter(adapterId, parseText);
						if (!draft || !draft.input) {
							return synthesizeProjectedLine(
								index + 1,
								lineText,
								macroName,
								adapterId,
								[],
								undefined,
								undefined,
								[
									scratchpadDiagnostic(
										SCRATCHPAD_MESSAGE_KEYS.parseFailed,
										macroName,
										lineText,
									),
								] as const,
								[],
								defaultId ?? undefined,
								macroName,
								"default",
							);
						}
						return synthesizeProjectedLine(
							index + 1,
							lineText,
							macroName,
							adapterId,
							draft.projections,
							draft.preview,
							draft.executionPreview,
							draft.diagnostics,
							[],
							defaultId ?? undefined,
							draft.input.macroName,
							"default",
						);
					} catch (error) {
						console.error(
							`Parse failed for scratchpad line ${index + 1}:`,
							error,
						);
						return {
							lineNumber: index + 1,
							rawText: lineText,
							defaultMacroId: defaultId ?? undefined,
							effectiveMacroName: macroName,
							macroResolution: "default" as const,
							placeholder,
							isValid: false,
							projections: [],
							chips: [],
							diagnostics: [
								scratchpadDiagnostic(
									SCRATCHPAD_MESSAGE_KEYS.parseError,
									macroName,
									lineText,
								),
							],
						};
					}
				}

				// 3. Neither explicit macro nor default.
				return createEmptyProjectedLine(index + 1, lineText);
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
		if (!line || !line.isValid || !line.adapterId || !line.effectiveMacroName) {
			return null;
		}

		const effectiveName = line.effectiveMacroName;
		const prefix = this.runtime.context.syntax.macroStartToken;
		const trimmed = line.rawText.trim();
		const withoutPrefix =
			prefix && trimmed.startsWith(prefix)
				? trimmed.slice(prefix.length).trim()
				: trimmed;
		const invokedAs =
			withoutPrefix.split(/\s+/u)[0] || line.macroName || effectiveName;

		try {
			const parseText = matchesMacroVerb(trimmed, effectiveName, prefix)
				? line.rawText
				: prefix
					? `${prefix}${effectiveName} ${line.rawText}`
					: `${effectiveName} ${line.rawText}`;

			const draft = await this.runtime.parseAdapter(line.adapterId, parseText);
			const result = await this.runtime.executeAdapter(line.adapterId, draft);
			this.executedLineIndices.add(lineIndex);
			this.recordExecution(effectiveName);
			this.notify();
			return {
				lineNumber: line.lineNumber,
				rawText: line.rawText,
				macroId: line.adapterId,
				invokedAs,
				success: true,
				result,
				executedAt: Date.now(),
			};
		} catch (error) {
			console.error(
				`Execution failed for scratchpad line ${line.lineNumber}:`,
				error,
			);
			return {
				lineNumber: line.lineNumber,
				rawText: line.rawText,
				macroId: line.adapterId,
				invokedAs,
				success: false,
				error: messageDescriptor(SCRATCHPAD_MESSAGE_KEYS.executionFailed),
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
				throw new ScratchpadExecutionPolicyError({
					code: "EDITOR_LINE_NOT_EXECUTABLE",
					messageKey: "editor.line.notExecutable",
					safeDetails: { lineNumber, lineStatus },
				});
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
			throw new ScratchpadExecutionPolicyError({
				code: "EDITOR_RANGE_INVALID",
				messageKey: "editor.range.invalid",
			});
	}
}

/**
 * Builds a structured diagnostic for a line the session could not project.
 * `messageKey`/`messageParams` are the canonical payload; `message` repeats the
 * key so no untranslated prose reaches a surface that has not yet migrated off
 * `DiagnosticDto.message`.
 */
function scratchpadDiagnostic(
	messageKey: string,
	macroName: string,
	rawText: string,
): MacroDiagnostic {
	return {
		code: "NO_MATCH",
		messageKey,
		messageParams: { macroName },
		start: 0,
		end: rawText.length,
	};
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
