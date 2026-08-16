import type { MacroSpec } from "../contracts/macro";
import type {
	MacroLockLike,
	MacroSlotProjection,
	SlotBinding,
} from "../contracts/slots";
import { parseMacroLine } from "../parser/macro-parser";

export function projectMacroSlots(
	draftText: string,
	spec: MacroSpec | null | undefined,
	options: Parameters<typeof parseMacroLine>[2] = {},
): MacroSlotProjection[] {
	if (!spec) return [];
	const parsed = parseMacroLine(draftText, spec, options);
	if (!parsed) return [];
	return parsed.matches.flatMap((match) => {
		const argument = spec.arguments.find(
			(candidate) => candidate.argumentId === match.argumentId,
		);
		if (!argument) return [];
		return [
			{
				macroId: spec.id,
				macroVersion: spec.version ?? 1,
				argumentId: argument.argumentId,
				start: match.extraction.start,
				end: match.extraction.end,
				rawText: match.rawValue,
				displayText: match.rawValue,
				status:
					match.matchKind === "prefix" || match.stability === "unstable"
						? "pending"
						: "bound",
				occurrence: match.occurrence,
				formId: match.formId,
				bindingSource: match.source,
				anchorStart: match.anchor?.start,
				anchorEnd: match.anchor?.end,
				friendlyText: match.friendlyText,
				diagnostics: [],
				match,
			} satisfies MacroSlotProjection,
		];
	});
}

export function activeMacroSlot(
	projections: readonly MacroSlotProjection[],
	cursorOffset: number,
): MacroSlotProjection | undefined {
	return projections.find(
		(slot) => cursorOffset >= slot.start && cursorOffset <= slot.end,
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
	return direction > 0
		? (ordered.find((slot) => slot.start > cursorOffset) ?? ordered[0])
		: ([...ordered].reverse().find((slot) => slot.end < cursorOffset) ??
				ordered[ordered.length - 1]);
}

export function lockMacroSlot(
	projection: MacroSlotProjection,
	lockedAtRevision = 0,
	source: "explicit" | "accepted" = "explicit",
): MacroLockLike & {
	lockedAtRevision: number;
	source: "explicit" | "accepted";
} {
	return { ...projectionToLock(projection), lockedAtRevision, source };
}

export function shiftMacroLocksForInsertion<T extends MacroLockLike>(
	locks: readonly T[],
	cursorOffset: number,
	insertedLength: number,
): T[] {
	return locks.flatMap((lock) => {
		if (cursorOffset > lock.start && cursorOffset < lock.end) return [];
		return cursorOffset <= lock.start
			? [
					{
						...lock,
						start: lock.start + insertedLength,
						end: lock.end + insertedLength,
					},
				]
			: [lock];
	});
}

export function shiftMacroLocksForDeletion<T extends MacroLockLike>(
	locks: readonly T[],
	deleteStart: number,
	deleteEnd: number,
): T[] {
	return locks.flatMap((lock) => {
		if (deleteStart < lock.end && deleteEnd > lock.start) return [];
		return lock.start >= deleteEnd
			? [
					{
						...lock,
						start: lock.start - (deleteEnd - deleteStart),
						end: lock.end - (deleteEnd - deleteStart),
					},
				]
			: [lock];
	});
}

export function removeMacroLock<T extends MacroLockLike>(
	locks: readonly T[],
	target: Pick<MacroLockLike, "argumentId" | "start" | "end">,
): T[] {
	return locks.filter(
		(lock) =>
			lock.argumentId !== target.argumentId ||
			lock.start !== target.start ||
			lock.end !== target.end,
	);
}

export function upsertMacroLock<T extends MacroLockLike>(
	locks: readonly T[],
	lock: T,
): T[] {
	const index = locks.findIndex(
		(candidate) =>
			candidate.macroId === lock.macroId &&
			candidate.macroVersion === lock.macroVersion &&
			candidate.start === lock.start &&
			candidate.argumentId === lock.argumentId,
	);
	if (index < 0) return [...locks, lock];
	if (locks[index]?.rawText === lock.rawText) return [...locks];
	const next = [...locks];
	next[index] = lock;
	return next;
}

export function applyMacroLocks(
	projections: readonly MacroSlotProjection[],
	locks: readonly MacroLockLike[],
	activeArgumentId?: string,
	draftText?: string,
): MacroSlotProjection[] {
	return projections.map((projection) => {
		const lock = locks.find((candidate) => {
			const occurrence = (candidate as MacroLockLike & { occurrence?: number })
				.occurrence;
			return (
				candidate.macroId === projection.macroId &&
				candidate.macroVersion === projection.macroVersion &&
				candidate.argumentId === projection.argumentId &&
				(occurrence === undefined ||
					occurrence === (projection.occurrence ?? 0)) &&
				candidate.start >= projection.start &&
				candidate.end <= projection.end &&
				(candidate.rawText === undefined ||
					draftText === undefined ||
					draftText.slice(candidate.start, candidate.end) === candidate.rawText)
			);
		});
		if (!lock)
			return projection.argumentId === activeArgumentId
				? { ...projection, status: "bound" }
				: projection;
		return {
			...projection,
			start: lock.start,
			end: lock.end,
			rawText: lock.rawText ?? projection.rawText,
			displayText: lock.binding?.displayValue ?? projection.displayText,
			binding: lock.binding,
			status: "locked",
		};
	});
}

function projectionToLock(projection: MacroSlotProjection): MacroLockLike {
	return {
		argumentId: projection.argumentId,
		macroId: projection.macroId,
		macroVersion: projection.macroVersion,
		start: projection.start,
		end: projection.end,
		rawText: projection.rawText,
		binding: projection.binding,
	};
}

export type { SlotBinding };
