import {
	type CompletionKey,
	type CompletionSession,
	cycleIndex,
	deriveCompletionSession,
	mergeCandidate,
} from "./completion-session-helper";
import {
	getMacroArgumentStatuses,
	type MacroArgumentStatus,
} from "./macro-authoring-projection";
import {
	type MacroAuthoringRender,
	renderMacroAuthoringTemplate,
} from "./macro-authoring-renderer";
import type { AutocompleteSuggestion } from "./macro-autocomplete";
import type { MacroCompileResult as MacroCompilationResult } from "./macro-compiler";
import type { MacroDefinition } from "./macro-definition";
import type { MacroDraftPreview } from "./macro-draft-preview";
import type { SyntaxProfile } from "./macro-profile";
import {
	activeMacroSlot,
	applyMacroLocks,
	type MacroLockLike,
	type MacroSlotProjection,
	projectMacroSlots,
} from "./macro-slots";

export interface MacroAuthoringDiagnostic {
	code: string;
	message: string;
	level: "error" | "warning" | "info";
}

export type MacroCompletionState =
	| { status: "idle"; candidates: AutocompleteSuggestion[] }
	| {
			status: "cycling";
			candidates: AutocompleteSuggestion[];
			highlightIndex: number;
			session: CompletionSession;
			requestId: number;
	  };

export interface MacroAuthoringSnapshot {
	mode: "idle" | "macro";
	rawText: string;
	cursorOffset: number;

	definition?: MacroDefinition;
	slots: MacroSlotProjection[];
	locks: MacroLockLike[];
	activeArgumentId?: string;
	childDefinitions: MacroDefinition[];

	completion: MacroCompletionState;
	diagnostics: MacroAuthoringDiagnostic[];
	statuses: MacroArgumentStatus[];

	authoringPreview?: MacroAuthoringRender;
	executablePreview?: MacroDraftPreview;
	compilation?: MacroCompilationResult;
	requestId: number;
}

export type MacroAuthoringAction =
	| { type: "set_text"; text: string; cursorOffset?: number }
	| { type: "set_cursor"; cursorOffset: number }
	| { type: "insert_text"; text: string }
	| { type: "backspace" }
	| { type: "move_cursor"; delta: -1 | 1 }
	| { type: "cursor_home" }
	| { type: "cursor_end" }
	| { type: "lock_active" }
	| { type: "unlock_active" }
	| { type: "completion_key"; key: CompletionKey }
	| { type: "tab"; shift?: boolean }
	| { type: "arrow_up" }
	| { type: "arrow_down" }
	| { type: "arrow_left" }
	| { type: "arrow_right" }
	| { type: "escape" }
	| {
			type: "suggestions_resolved";
			requestId: number;
			candidates: AutocompleteSuggestion[];
	  }
	| {
			type: "inspection_resolved";
			definition?: MacroDefinition;
			childDefinitions?: MacroDefinition[];
	  }
	| { type: "submit" };

export interface CreateMacroAuthoringSessionOptions {
	profile: SyntaxProfile;
	initialText?: string;
	initialCursor?: number;
	locks?: MacroLockLike[];
}

export class MacroAuthoringSession {
	private snapshot: MacroAuthoringSnapshot;
	private readonly profile: SyntaxProfile;
	private currentRequestId = 0;

	constructor(options: CreateMacroAuthoringSessionOptions) {
		this.profile = options.profile;
		const rawText = options.initialText ?? "";
		const cursorOffset = options.initialCursor ?? rawText.length;
		const isMacro = rawText.startsWith(this.profile.macroStartToken);

		this.snapshot = {
			mode: isMacro ? "macro" : "idle",
			rawText,
			cursorOffset,
			slots: [],
			locks: options.locks ?? [],
			childDefinitions: [],
			completion: { status: "idle", candidates: [] },
			diagnostics: [],
			statuses: [],
			requestId: 0,
		};
		this.recomputeProjections();
	}

	public getSnapshot(): MacroAuthoringSnapshot {
		return this.snapshot;
	}

	public getNextRequestId(): number {
		this.currentRequestId += 1;
		this.snapshot = {
			...this.snapshot,
			requestId: this.currentRequestId,
		};
		return this.currentRequestId;
	}

	public dispatch(action: MacroAuthoringAction): MacroAuthoringSnapshot {
		switch (action.type) {
			case "set_text": {
				const isMacro = action.text.startsWith(this.profile.macroStartToken);
				const cursorOffset = action.cursorOffset ?? action.text.length;
				this.snapshot = {
					...this.snapshot,
					mode: isMacro ? "macro" : "idle",
					rawText: action.text,
					cursorOffset,
					completion: { status: "idle", candidates: [] },
				};
				this.recomputeProjections();
				break;
			}
			case "set_cursor": {
				const nextOffset = Math.max(
					0,
					Math.min(action.cursorOffset, this.snapshot.rawText.length),
				);
				this.snapshot = {
					...this.snapshot,
					cursorOffset: nextOffset,
				};
				this.recomputeProjections();
				break;
			}
			case "insert_text": {
				const before = this.snapshot.rawText.slice(
					0,
					this.snapshot.cursorOffset,
				);
				const after = this.snapshot.rawText.slice(this.snapshot.cursorOffset);
				const newText = before + action.text + after;
				const newCursor = this.snapshot.cursorOffset + action.text.length;
				const isMacro = newText.startsWith(this.profile.macroStartToken);

				this.snapshot = {
					...this.snapshot,
					mode: isMacro ? "macro" : "idle",
					rawText: newText,
					cursorOffset: newCursor,
					completion: { status: "idle", candidates: [] },
				};
				this.recomputeProjections();
				break;
			}
			case "backspace": {
				if (this.snapshot.cursorOffset <= 0) break;
				const before = this.snapshot.rawText.slice(
					0,
					this.snapshot.cursorOffset - 1,
				);
				const after = this.snapshot.rawText.slice(this.snapshot.cursorOffset);
				const newText = before + after;
				const newCursor = this.snapshot.cursorOffset - 1;
				const isMacro = newText.startsWith(this.profile.macroStartToken);

				this.snapshot = {
					...this.snapshot,
					mode: isMacro ? "macro" : "idle",
					rawText: newText,
					cursorOffset: newCursor,
					completion: { status: "idle", candidates: [] },
				};
				this.recomputeProjections();
				break;
			}
			case "move_cursor": {
				const newCursor = Math.max(
					0,
					Math.min(
						this.snapshot.cursorOffset + action.delta,
						this.snapshot.rawText.length,
					),
				);
				this.snapshot = {
					...this.snapshot,
					cursorOffset: newCursor,
					completion:
						this.snapshot.completion.status === "cycling"
							? {
									status: "idle",
									candidates: this.snapshot.completion.candidates,
								}
							: this.snapshot.completion,
				};
				this.recomputeProjections();
				break;
			}
			case "cursor_home": {
				this.snapshot = {
					...this.snapshot,
					cursorOffset: 0,
					completion: { status: "idle", candidates: [] },
				};
				this.recomputeProjections();
				break;
			}
			case "cursor_end": {
				this.snapshot = {
					...this.snapshot,
					cursorOffset: this.snapshot.rawText.length,
					completion: { status: "idle", candidates: [] },
				};
				this.recomputeProjections();
				break;
			}
			case "escape": {
				this.snapshot = {
					...this.snapshot,
					completion: { status: "idle", candidates: [] },
				};
				break;
			}
			case "arrow_left": {
				this.dispatch({ type: "move_cursor", delta: -1 });
				break;
			}
			case "arrow_right": {
				this.dispatch({ type: "move_cursor", delta: 1 });
				break;
			}
			case "arrow_up":
			case "arrow_down": {
				const direction = action.type === "arrow_up" ? -1 : 1;
				const atEnd =
					this.snapshot.cursorOffset === this.snapshot.rawText.length;
				if (atEnd) {
					const comp = this.snapshot.completion;
					if (comp.status === "cycling" && comp.candidates.length > 0) {
						const nextIdx = cycleIndex(
							comp.highlightIndex,
							comp.candidates.length,
							direction,
						);
						this.snapshot = {
							...this.snapshot,
							completion: {
								...comp,
								highlightIndex: nextIdx,
							},
						};
					} else if (comp.status === "idle" && comp.candidates.length > 0) {
						const initialIdx =
							action.type === "arrow_down" ? 0 : comp.candidates.length - 1;
						const session = deriveCompletionSession(
							this.snapshot.rawText,
							this.profile,
						);
						if (session) {
							this.snapshot = {
								...this.snapshot,
								completion: {
									status: "cycling",
									candidates: comp.candidates,
									highlightIndex: initialIdx,
									session,
									requestId: this.snapshot.requestId,
								},
							};
						}
					}
				}
				break;
			}
			case "tab": {
				const atEnd =
					this.snapshot.cursorOffset === this.snapshot.rawText.length;
				if (!atEnd) {
					this.snapshot = {
						...this.snapshot,
						completion: { status: "idle", candidates: [] },
					};
					break;
				}

				const comp = this.snapshot.completion;
				const candidates = comp.candidates;
				if (candidates.length > 0) {
					const selectedIdx =
						comp.status === "cycling"
							? comp.highlightIndex
							: action.shift
								? candidates.length - 1
								: 0;
					const candidate = candidates[selectedIdx];
					const session =
						comp.status === "cycling"
							? comp.session
							: deriveCompletionSession(this.snapshot.rawText, this.profile);

					if (candidate && session) {
						const committedVal = candidate.value ?? candidate.label;
						const committedText = mergeCandidate(
							this.snapshot.rawText,
							committedVal,
							true,
							this.profile,
						);

						this.snapshot = {
							...this.snapshot,
							rawText: committedText,
							cursorOffset: committedText.length,
							completion: { status: "idle", candidates: [] },
						};
						this.recomputeProjections();
					}
				}
				break;
			}
			case "suggestions_resolved": {
				if (action.requestId < this.snapshot.requestId) {
					break;
				}
				if (this.snapshot.completion.status === "cycling") {
					break;
				}
				this.snapshot = {
					...this.snapshot,
					completion: {
						status: "idle",
						candidates: action.candidates,
					},
				};
				break;
			}
			case "inspection_resolved": {
				this.snapshot = {
					...this.snapshot,
					definition: action.definition,
					childDefinitions: action.childDefinitions ?? [],
				};
				this.recomputeProjections();
				break;
			}
			case "lock_active": {
				const activeSlot = activeMacroSlot(
					this.snapshot.slots,
					this.snapshot.cursorOffset,
				);
				if (activeSlot && activeSlot.binding) {
					const newLock: MacroLockLike = {
						argumentId: activeSlot.argumentId,
						macroId: activeSlot.macroId,
						macroVersion: activeSlot.macroVersion,
						start: activeSlot.start,
						end: activeSlot.end,
						rawText: activeSlot.rawText,
						binding: activeSlot.binding,
					};
					const updatedLocks = this.snapshot.locks.some(
						(l) => l.argumentId === activeSlot.argumentId,
					)
						? this.snapshot.locks.map((l) =>
								l.argumentId === activeSlot.argumentId ? newLock : l,
							)
						: [...this.snapshot.locks, newLock];

					this.snapshot = {
						...this.snapshot,
						locks: updatedLocks,
					};
					this.recomputeProjections();
				}
				break;
			}
			case "unlock_active": {
				const activeSlot = activeMacroSlot(
					this.snapshot.slots,
					this.snapshot.cursorOffset,
				);
				if (activeSlot) {
					this.snapshot = {
						...this.snapshot,
						locks: this.snapshot.locks.filter(
							(l) => l.argumentId !== activeSlot.argumentId,
						),
					};
					this.recomputeProjections();
				}
				break;
			}
		}
		return this.snapshot;
	}

	private recomputeProjections(): void {
		if (!this.snapshot.rawText.startsWith(this.profile.macroStartToken)) {
			this.snapshot = {
				...this.snapshot,
				mode: "idle",
				slots: [],
				activeArgumentId: undefined,
				statuses: [],
				authoringPreview: undefined,
			};
			return;
		}

		this.snapshot.mode = "macro";
		if (this.snapshot.definition) {
			this.snapshot.slots = applyMacroLocks(
				projectMacroSlots(
					this.snapshot.rawText,
					this.snapshot.definition,
					this.profile,
				),
				this.snapshot.locks,
				undefined,
				this.snapshot.rawText,
				this.snapshot.definition,
			);
			this.snapshot.statuses = getMacroArgumentStatuses(
				this.snapshot.definition,
				this.snapshot.slots,
			);

			const activeSlot = activeMacroSlot(
				this.snapshot.slots,
				this.snapshot.cursorOffset,
			);
			this.snapshot.activeArgumentId = activeSlot?.argumentId;

			const authoringTemplate =
				this.snapshot.definition.authoringTemplates?.[0];
			if (authoringTemplate) {
				const values = this.snapshot.slots.map((s) => ({
					argumentId: s.argumentId,
					value: s.rawText,
					status:
						s.status === "locked" || s.binding
							? ("bound" as const)
							: s.status === "invalid"
								? ("invalid" as const)
								: ("unresolved" as const),
				}));
				this.snapshot.authoringPreview = renderMacroAuthoringTemplate(
					authoringTemplate,
					values,
				);
			}
		}
	}

	public setCompilation(result: MacroCompilationResult | undefined): void {
		this.snapshot = {
			...this.snapshot,
			compilation: result,
		};
	}

	public isExecutable(): boolean {
		if (this.snapshot.mode !== "macro" || !this.snapshot.definition)
			return false;
		// Check that all required arguments have non-remaining status
		const remaining = this.snapshot.statuses.filter(
			(s) => s.status === "remaining",
		);
		return remaining.length === 0;
	}
}
