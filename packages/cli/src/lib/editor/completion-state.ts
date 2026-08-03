import type { AutocompleteSuggestion } from "@stateful-mcp/clinical/notebook/command-autocomplete";

export type CompletionMode = "verb" | "arg";

export interface CompletionSession {
	mode: CompletionMode;
	verb: string;
	argIndex: number;
	prefix: string;
	commandLineSnapshot: string;
}

export type CompletionState =
	| { status: "idle" }
	| {
			status: "cycling";
			candidates: AutocompleteSuggestion[];
			highlightIndex: number;
			session: CompletionSession;
			loading?: boolean;
			engineCandidates?: AutocompleteSuggestion[];
	  };

export function cycleIndex(
	current: number,
	length: number,
	direction: 1 | -1,
): number {
	if (length <= 0) return -1;
	return (((current + direction) % length) + length) % length;
}

export function deriveCompletionSession(
	commandLine: string,
): CompletionSession | null {
	const partial = commandLine.slice(1);
	if (!partial) return null;
	const spaceIdx = partial.indexOf(" ");
	if (spaceIdx < 0) {
		return {
			mode: "verb",
			verb: "",
			argIndex: -1,
			prefix: partial,
			commandLineSnapshot: commandLine,
		};
	}
	const verb = partial.slice(0, spaceIdx);
	const afterVerb = partial.slice(spaceIdx + 1);
	const argParts = afterVerb.split(" ");
	const argIndex = Math.max(0, argParts.length - 1);
	const prefix = argParts[argIndex] ?? "";
	return {
		mode: "arg",
		verb,
		argIndex,
		prefix,
		commandLineSnapshot: commandLine,
	};
}

export function completionRemainder(candidate: string, prefix: string): string {
	if (!candidate.startsWith(prefix)) return "";
	return candidate.slice(prefix.length);
}

export function mergeCandidate(
	commandLine: string,
	candidate: string,
	trailingSpace: boolean,
): string {
	const partial = commandLine.slice(1);
	const spaceIdx = partial.indexOf(" ");
	if (spaceIdx >= 0) {
		const verb = partial.slice(0, spaceIdx);
		const afterVerb = partial.slice(spaceIdx + 1);
		const lastSpace = afterVerb.lastIndexOf(" ");
		const prevArgs = lastSpace >= 0 ? afterVerb.slice(0, lastSpace + 1) : "";
		return `${commandLine[0] ?? ":"}${verb} ${prevArgs}${candidate}${trailingSpace ? " " : ""}`;
	}
	return `${commandLine[0] ?? ":"}${candidate}${trailingSpace ? " " : ""}`;
}

export type CompletionKey =
	| { kind: "tab"; shift: boolean }
	| { kind: "up" }
	| { kind: "down" }
	| { kind: "space" }
	| { kind: "enter" }
	| { kind: "char"; char: string }
	| { kind: "backspace" };

export interface CompletionTransitionResult {
	completionState: CompletionState;
	committedLine?: string;
	shouldAppend?: string;
	historyMove?: "prev" | "next";
	executeLine?: string;
	backspace?: boolean;
}

export function reduceCompletion(
	current: CompletionState,
	key: CompletionKey,
	commandLine: string,
	getSuggestions: (partial: string) => AutocompleteSuggestion[],
): CompletionTransitionResult {
	// Staleness guard: if commandLine changed since session creation, reset.
	if (
		current.status === "cycling" &&
		commandLine !== current.session.commandLineSnapshot
	) {
		current = { status: "idle" };
	}

	switch (key.kind) {
		case "tab": {
			const partial = commandLine.slice(1);
			const suggestions = getSuggestions(partial);
			if (suggestions.length === 0)
				return { completionState: { status: "idle" } };
			const currentIdx =
				current.status === "cycling" ? current.highlightIndex : -1;
			const nextIdx = cycleIndex(
				currentIdx,
				suggestions.length,
				key.shift ? -1 : 1,
			);
			const session = deriveCompletionSession(commandLine);
			if (!session) return { completionState: { status: "idle" } };
			const candidate = suggestions[nextIdx];
			return {
				completionState: {
					status: "cycling",
					candidates: suggestions,
					highlightIndex: nextIdx,
					session,
				},
				committedLine: candidate
					? mergeCandidate(commandLine, candidate.completionText ?? candidate.verb, true)
					: undefined,
			};
		}
		case "up":
		case "down": {
			if (current.status === "cycling") {
				const nextIdx = cycleIndex(
					current.highlightIndex,
					current.candidates.length,
					key.kind === "up" ? -1 : 1,
				);
				return {
					completionState: {
						status: "cycling",
						candidates: current.candidates,
						highlightIndex: nextIdx,
						session: current.session,
					},
				};
			}
			return {
				completionState: { status: "idle" },
				historyMove: key.kind === "up" ? "prev" : "next",
			};
		}
		case "space": {
			if (current.status === "cycling") {
				const candidate = current.candidates[current.highlightIndex];
				if (candidate) {
					return {
						completionState: { status: "idle" },
						committedLine: mergeCandidate(commandLine, candidate.verb, true),
					};
				}
			}
			return {
				completionState: { status: "idle" },
				shouldAppend: " ",
			};
		}
		case "enter": {
			if (current.status === "cycling") {
				const candidate = current.candidates[current.highlightIndex];
				if (candidate) {
					return {
						completionState: { status: "idle" },
						executeLine: mergeCandidate(commandLine, candidate.completionText ?? candidate.verb, false),
					};
				}
			}
			return {
				completionState: { status: "idle" },
				executeLine: commandLine,
			};
		}
		case "char":
			return {
				completionState: { status: "idle" },
				shouldAppend: key.char,
			};
		case "backspace":
			return {
				completionState: { status: "idle" },
				backspace: true,
			};
	}
}
