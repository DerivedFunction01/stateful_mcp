export type CompletionState =
	| { status: "idle" }
	| { status: "cycling"; candidates: string[]; highlightIndex: number };

export function cycleIndex(
	current: number,
	length: number,
	direction: 1 | -1,
): number {
	if (length === 0) return -1;
	return (((current + direction) % length) + length) % length;
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
		return `:${verb} ${prevArgs}${candidate}${trailingSpace ? " " : ""}`;
	}
	return `:${candidate}${trailingSpace ? " " : ""}`;
}