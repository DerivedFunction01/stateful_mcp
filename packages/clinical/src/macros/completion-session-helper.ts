export type CompletionKey =
	| { kind: "tab"; shift: boolean }
	| { kind: "up" }
	| { kind: "down" }
	| { kind: "space" }
	| { kind: "enter" }
	| { kind: "char"; char: string }
	| { kind: "backspace" };

export type CompletionMode = "verb" | "arg";

export interface CompletionSession {
	mode: CompletionMode;
	verb: string;
	argIndex: number;
	prefix: string;
	commandLineSnapshot: string;
}

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
	syntaxProfile: { macroStartToken: string; directCommandToken?: string },
): CompletionSession | null {
	const directToken = syntaxProfile.directCommandToken ?? "/";
	const token = commandLine.startsWith(syntaxProfile.macroStartToken)
		? syntaxProfile.macroStartToken
		: directToken;
	const partial = commandLine.slice(token.length);
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

export function mergeCandidate(
	commandLine: string,
	candidate: string,
	trailingSpace: boolean,
	syntaxProfile: { macroStartToken: string; directCommandToken?: string },
): string {
	const directToken = syntaxProfile.directCommandToken ?? "/";
	const token = commandLine.startsWith(syntaxProfile.macroStartToken)
		? syntaxProfile.macroStartToken
		: directToken;
	if (token && candidate.startsWith(token)) {
		return `${candidate}${trailingSpace ? " " : ""}`;
	}
	const partial = commandLine.slice(token.length);
	const spaceIdx = partial.indexOf(" ");
	if (spaceIdx >= 0) {
		const verb = partial.slice(0, spaceIdx);
		const afterVerb = partial.slice(spaceIdx + 1);
		const lastSpace = afterVerb.lastIndexOf(" ");
		const prevArgs = lastSpace >= 0 ? afterVerb.slice(0, lastSpace + 1) : "";
		return `${token}${verb} ${prevArgs}${candidate}${trailingSpace ? " " : ""}`;
	}
	return `${token}${candidate}${trailingSpace ? " " : ""}`;
}
