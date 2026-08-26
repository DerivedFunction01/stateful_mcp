import type {
	CompiledFundamentalVariant,
	FundamentalExtraction,
} from "./contracts";

/** Extracts a complete configured fundamental without interpreting its slots. */
export function extractFundamental(
	input: string,
	compiled: CompiledFundamentalVariant,
): FundamentalExtraction | undefined {
	const match = compiled.regex.exec(input.trim());
	if (!match?.groups) return undefined;
	const slots: Record<string, string> = {};
	const slotSpans: Record<string, { start: number; end: number }> = {};
	for (let index = 0; index < compiled.slots.length; index++) {
		const slot = compiled.slots[index]!;
		const name = `f_${index}_${slot.id.replace(/[^A-Za-z0-9_]/g, "_")}`;
		const value = match.groups[name];
		if (value === undefined) return undefined;
		slots[slot.id] = value.trim();
		const span = match.indices?.groups?.[name];
		if (span) slotSpans[slot.id] = { start: span[0], end: span[1] };
	}
	return {
		groupId: compiled.groupId,
		variantId: compiled.variantId,
		slots,
		slotSpans,
		matchedPatterns: compiled.patternIds,
		...(compiled.priority === undefined ? {} : { priority: compiled.priority }),
	};
}
