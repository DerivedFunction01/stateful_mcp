import {
	type MacroArgumentMatch,
	type MacroCaptureSpan,
	type MacroDefinition,
	parseMacroLine,
} from "@stateful-mcp/clinical";

export interface MacroSlotProjection {
	macroId: string;
	macroVersion: number;
	argumentId: string;
	roleName: string;
	start: number;
	end: number;
	anchorStart?: number;
	anchorEnd?: number;
	friendlyText?: string;
	extractionPattern?: string;
	rawText: string;
	displayText: string;
	bindingSource?: "named" | "positional" | "inferred" | "rule" | "friendly";
	status: "unbound" | "bound" | "invalid" | "locked";
	diagnostics: string[];
	occurrence?: number;
	formId?: string;
	captureSpans?: MacroCaptureSpan[];
}

export interface MacroLockState {
	argumentId: string;
	macroId: string;
	macroVersion: number;
	start: number;
	end: number;
	lockedAtRevision: number;
	source: "explicit" | "accepted";
}

export function projectMacroSlots(
	draftText: string,
	definition: MacroDefinition | null | undefined,
): MacroSlotProjection[] {
	if (!definition) return [];
	const parsed = parseMacroLine(draftText, 0, { definition });
	if (!parsed?.matches?.length) return [];
	return parsed.matches.flatMap((match) => {
		const argument = definition.arguments.find(
			(candidate) => candidate.argumentId === match.argumentId,
		);
		if (!argument) return [];
		return [toProjection(draftText, definition, argument, match)];
	});
}

export function activeMacroSlot(
	projections: readonly MacroSlotProjection[],
	cursorOffset: number,
): MacroSlotProjection | undefined {
	return (
		projections.find(
			(slot) => cursorOffset >= slot.start && cursorOffset <= slot.end,
		) ??
		projections
			.filter((slot) => slot.start > cursorOffset)
			.sort((left, right) => left.start - right.start)[0] ??
		projections
			.filter((slot) => slot.end <= cursorOffset)
			.sort((left, right) => right.end - left.end)[0]
	);
}

export function nextMacroSlot(
	projections: readonly MacroSlotProjection[],
	cursorOffset: number,
	direction: 1 | -1 = 1,
): MacroSlotProjection | undefined {
	const ordered = [...projections].sort(
		(left, right) => left.start - right.start,
	);
	if (!ordered.length) return undefined;
	if (direction > 0) {
		return ordered.find((slot) => slot.start > cursorOffset) ?? ordered[0];
	}
	return (
		[...ordered].reverse().find((slot) => slot.end < cursorOffset) ??
		ordered[ordered.length - 1]
	);
}

export function lockMacroSlot(
	projection: MacroSlotProjection,
	lockedAtRevision: number,
	source: MacroLockState["source"] = "explicit",
): MacroLockState {
	return {
		argumentId: projection.argumentId,
		macroId: projection.macroId,
		macroVersion: projection.macroVersion,
		start: projection.start,
		end: projection.end,
		lockedAtRevision,
		source,
	};
}

export interface MacroLockLike {
	argumentId: string;
	macroId: string;
	macroVersion: number;
	start: number;
	end: number;
}

export function applyMacroLocks(
	projections: readonly MacroSlotProjection[],
	locks: readonly MacroLockLike[],
	activeArgumentId?: string,
): MacroSlotProjection[] {
	return projections.map((projection) => {
		const locked = locks.some(
			(lock) =>
				lock.macroId === projection.macroId &&
				lock.macroVersion === projection.macroVersion &&
				lock.argumentId === projection.argumentId &&
				lock.start === projection.start &&
				lock.end === projection.end,
		);
		return {
			...projection,
			status: locked
				? "locked"
				: projection.argumentId === activeArgumentId
					? "bound"
					: projection.status,
		};
	});
}

function toProjection(
	draftText: string,
	definition: MacroDefinition,
	argument: MacroDefinition["arguments"][number],
	match: MacroArgumentMatch,
): MacroSlotProjection {
	const rawText = draftText.slice(match.extraction.start, match.extraction.end);
	return {
		macroId: definition.macroId,
		macroVersion: definition.version,
		argumentId: match.argumentId,
		roleName: argument.roleName,
		start: match.extraction.start,
		end: match.extraction.end,
		anchorStart: match.anchor?.start,
		anchorEnd: match.anchor?.end,
		friendlyText: match.friendlyText,
		extractionPattern: argument.extraction.patterns?.join("|"),
		rawText,
		displayText: rawText,
		bindingSource: match.source,
		status: "bound",
		diagnostics: [],
		occurrence: match.occurrence,
		formId: match.formId,
		captureSpans: match.captureSpans,
	};
}
