import { describe, expect, test } from "bun:test";
import type { StructuredCell } from "@stateful-mcp/clinical/cells/structured-cell";
import {
	getHistoryViewport,
	historyRowHeight,
} from "../src/lib/editor/history-viewport";

let cellSequence = 0;

function cell(diagnosticCount = 0): StructuredCell {
	cellSequence += 1;
	return {
		cellId: `cell-${cellSequence}`,
		sessionId: "session",
		collection: { kind: "notebook", collectionId: "notebook" },
		authored: { rawText: "note" },
		lifecycle: { status: "committed", revision: 1 },
		source: {
			origin: "user",
			createdAt: "2026-08-05T00:00:00.000Z",
			updatedAt: "2026-08-05T00:00:00.000Z",
		},
		execution: {},
		diagnostics: Array.from({ length: diagnosticCount }, (_, index) => ({
			code: `diagnostic-${index}`,
			severity: "error",
			message: "error",
		})),
	};
}

describe("history viewport", () => {
	test("keeps every compact history row to one line", () => {
		expect(historyRowHeight(cell(0))).toBe(1);
		expect(historyRowHeight(cell(2))).toBe(1);
	});

	test("keeps the active cell visible in a bounded range", () => {
		const cells = Array.from({ length: 10 }, () => cell());
		const viewport = getHistoryViewport(cells, 8, 3);

		expect(viewport.start).toBe(6);
		expect(viewport.end).toBe(9);
		expect(viewport.start).toBeLessThanOrEqual(8);
		expect(viewport.end).toBeGreaterThan(8);
		expect(viewport.rows).toBe(3);
	});

	test("clamps the active index and handles empty history", () => {
		const cells = [cell(), cell()];
		expect(getHistoryViewport(cells, 99, 1)).toEqual({
			start: 1,
			end: 2,
			rows: 1,
		});
		expect(getHistoryViewport([], 0, 5)).toEqual({
			start: 0,
			end: 0,
			rows: 0,
		});
	});
});
