import { describe, expect, test } from "bun:test";
import { createEditorVisualRows } from "../src/components/EditorSurfaceView";

describe("scratchpad visual row projection", () => {
	test("numbers physical rows while preserving logical cell indexes", () => {
		const rows = createEditorVisualRows([
			"test",
			"harry potter\n12/31/2025\ncontinuation",
			"next macro",
		]);

		expect(rows.map((row) => row.displayLineNumber)).toEqual([1, 2, 3, 4, 5]);
		expect(rows.map((row) => row.logicalLineIndex)).toEqual([0, 1, 1, 1, 2]);
		expect(
			rows.filter((row) => row.isCellStart).map((row) => row.displayLineNumber),
		).toEqual([1, 2, 5]);
		expect(
			rows.filter((row) => row.isCellEnd).map((row) => row.displayLineNumber),
		).toEqual([1, 4, 5]);
	});

	test("preserves trailing embedded empty rows", () => {
		const rows = createEditorVisualRows(["macro\n"]);

		expect(rows).toHaveLength(2);
		expect(rows[1]).toMatchObject({
			logicalLineIndex: 0,
			segmentIndex: 1,
			displayLineNumber: 2,
			text: "",
			isCellStart: false,
			isCellEnd: true,
		});
	});

	test("always exposes an empty visual row for an empty document", () => {
		expect(createEditorVisualRows([])).toEqual([
			{
				logicalLineIndex: 0,
				segmentIndex: 0,
				displayLineNumber: 1,
				text: "",
				isCellStart: true,
				isCellEnd: true,
			},
		]);
	});
});
