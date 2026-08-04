import type { MacroSlotProjection } from "./macro-slots";

export type MacroRenderSegment =
	| { kind: "text"; text: string }
	| { kind: "slot"; text: string; status: MacroSlotProjection["status"] }
	| { kind: "cursor"; text: "█" };

export function buildMacroRenderSegments(
	text: string,
	slots: readonly MacroSlotProjection[],
	cursorOffset: number,
	showCursor: boolean,
): MacroRenderSegment[] {
	const result: MacroRenderSegment[] = [];
	const cursor = Math.max(0, Math.min(cursorOffset, text.length));
	let offset = 0;
	let cursorRendered = false;
	const addCursor = () => {
		if (!showCursor || cursorRendered) return;
		result.push({ kind: "cursor", text: "█" });
		cursorRendered = true;
	};
	for (const slot of [...slots].sort((a, b) => a.start - b.start)) {
		if (slot.start < offset) continue;
		const start = Math.max(offset, Math.min(slot.start, text.length));
		if (cursor >= offset && cursor <= start) {
			if (cursor > offset) result.push({ kind: "text", text: text.slice(offset, cursor) });
			addCursor();
			if (cursor < start) result.push({ kind: "text", text: text.slice(cursor, start) });
		} else if (start > offset) {
			result.push({ kind: "text", text: text.slice(offset, start) });
		}
		const end = Math.max(start, Math.min(slot.end, text.length));
		result.push({ kind: "slot", text: text.slice(start, end), status: slot.status });
		if (cursor > start && cursor < end) addCursor();
		offset = end;
	}
	if (cursor >= offset && cursor <= text.length) {
		if (cursor > offset) result.push({ kind: "text", text: text.slice(offset, cursor) });
		addCursor();
		if (cursor < text.length) result.push({ kind: "text", text: text.slice(cursor) });
	} else if (offset < text.length) {
		result.push({ kind: "text", text: text.slice(offset) });
	}
	if (showCursor && !cursorRendered) addCursor();
	return result.filter((segment) => segment.kind !== "text" || segment.text.length > 0);
}
