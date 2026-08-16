import type { ExtensionRuntime } from "../../extensions/runtime";
import type { CursorBuffer } from "../editor/cursor-buffer";
import {
	createEmptyProjectedLine,
	type ProjectedMacroLine,
	synthesizeProjectedLine,
} from "./live-projection";

export interface ScratchpadExecutionReceipt {
	readonly lineNumber: number;
	readonly rawText: string;
	readonly macroName: string;
	readonly result: unknown;
	readonly executedAt: number;
}

export class ScratchpadSession {
	private projectedLines: ProjectedMacroLine[] = [];
	private pinnedMacroId: string | null = null;
	private parseDebounceTimer: ReturnType<typeof setTimeout> | null = null;
	private readonly listeners = new Set<() => void>();

	constructor(
		public readonly runtime: ExtensionRuntime,
		public readonly buffer: CursorBuffer,
		private readonly debounceMs = 50,
	) {
		this.projectedLines = this.buffer
			.getLines()
			.map((text, idx) => createEmptyProjectedLine(idx + 1, text));

		this.buffer.subscribe(() => {
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

	getProjectedLines(): readonly ProjectedMacroLine[] {
		return this.projectedLines;
	}

	getProjectedLine(lineIndex: number): ProjectedMacroLine | undefined {
		return this.projectedLines[lineIndex];
	}

	getValidLineCount(): number {
		return this.projectedLines.filter((l) => l.isValid).length;
	}

	getTotalLineCount(): number {
		return this.projectedLines.length;
	}

	async parseAllLines(): Promise<readonly ProjectedMacroLine[]> {
		const lines = this.buffer.getLines();
		const registeredAdapters = this.runtime.adapters.list();
		const prefix = this.runtime.context.syntax.macroStartToken;

		const results = await Promise.all(
			lines.map(async (lineText, index) => {
				const trimmed = lineText.trim();
				if (!trimmed || registeredAdapters.length === 0) {
					return createEmptyProjectedLine(index + 1, lineText);
				}

				// 1. Explicit macro name match (e.g. ^vitals ...)
				let matching = registeredAdapters.find(
					(a) =>
						trimmed.startsWith(a.adapter.definition.name) ||
						(prefix
							? trimmed.startsWith(`${prefix}${a.adapter.definition.name}`)
							: false) ||
						trimmed.includes(a.adapter.definition.name),
				);

				// 2. Implicit / Pinned macro match (e.g. SOB 4hr 4/10)
				if (!matching && this.pinnedMacroId) {
					matching = registeredAdapters.find(
						(a) =>
							a.adapter.definition.id === this.pinnedMacroId ||
							a.adapter.definition.name === this.pinnedMacroId,
					);
				}

				if (!matching) {
					return createEmptyProjectedLine(index + 1, lineText);
				}

				try {
					const adapterId = matching.adapter.definition.id;
					const macroName = matching.adapter.definition.name;
					const parseText =
						trimmed.startsWith(macroName) ||
						(prefix ? trimmed.startsWith(`${prefix}${macroName}`) : false)
							? lineText
							: prefix
								? `${prefix}${macroName} ${lineText}`
								: `${macroName} ${lineText}`;

					const draft = await this.runtime.parseAdapter(adapterId, parseText);
					if (!draft || !draft.input) {
						return createEmptyProjectedLine(index + 1, lineText);
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
				} catch {
					return createEmptyProjectedLine(index + 1, lineText);
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
			const parseText =
				trimmed.startsWith(line.macroName) ||
				(prefix ? trimmed.startsWith(`${prefix}${line.macroName}`) : false)
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
				result,
				executedAt: Date.now(),
			};
		} catch (error) {
			console.error(
				`Execution failed for scratchpad line ${line.lineNumber}:`,
				error,
			);
			return null;
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
}
