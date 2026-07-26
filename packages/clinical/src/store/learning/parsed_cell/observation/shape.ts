// ── Shape Builders ────────────────────────────────────────────────────────────

import type { ParsedCellObservedShape } from "../../interfaces";

export function buildObservationShape(item: any): ParsedCellObservedShape {
	return {
		schema: item.targetSchema,
		slots: {
			conceptId: item.conceptId,
			severity: item.severity,
			certainty: item.certainty,
			status: item.status,
		},
	};
}
