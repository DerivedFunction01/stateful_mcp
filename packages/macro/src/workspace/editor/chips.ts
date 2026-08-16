import type { AssertionClauseRole } from "../../composition/assertion";
import type {
	MacroSlotProjection,
	MacroSlotStatus,
} from "../../contracts/slots";

export interface InteractiveTokenChip {
	readonly slotId: string;
	readonly startCol: number;
	readonly endCol: number;
	readonly rawValue: string;
	readonly displayText: string;
	readonly status: MacroSlotStatus;
	readonly role?: AssertionClauseRole;
	readonly diagnostics?: readonly string[];
}

export function extractTokenChipsFromProjections(
	projections: readonly MacroSlotProjection[],
	roles?: Readonly<Record<string, AssertionClauseRole>>,
): readonly InteractiveTokenChip[] {
	const chips: InteractiveTokenChip[] = [];

	for (const p of projections) {
		chips.push({
			slotId: p.argumentId,
			startCol: p.start,
			endCol: p.end,
			rawValue: p.rawText,
			displayText: p.displayText || p.rawText,
			status: p.status,
			role: roles ? roles[p.argumentId] : undefined,
			diagnostics: p.diagnostics,
		});
	}

	return chips.sort((a, b) => a.startCol - b.startCol);
}
