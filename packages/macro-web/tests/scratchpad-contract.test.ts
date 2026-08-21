import { describe, expect, test } from "bun:test";
import { createDiagnosticHostClient } from "../src/dev/diagnostic-host-client";
import { toScratchpadDiagnosticDto } from "../src/server/host-session-manager";

describe("host-owned scratchpad projection", () => {
	test("exposes revisioned logical lines and projected diagnostics", async () => {
		const snapshot = await createDiagnosticHostClient().getSnapshot();
		expect(snapshot.editor.activeDocument).toEqual({
			documentId: "fixture-document",
			textRevision: 0,
			lines: [],
		});
	});

	test("projects Macro diagnostics at the browser protocol boundary", () => {
		expect(
			toScratchpadDiagnosticDto(
				{ code: "NO_MATCH", message: "Invalid macro" },
				false,
			),
		).toEqual({
			severity: "error",
			message: "Invalid macro",
			code: "NO_MATCH",
		});
	});
});

/**
 * Phase 7 contract notes:
 *
 * - `textRevision` is the host document revision and must accompany parse/edit
 *   mutations; the browser must not create a second revision sequence.
 * - `lines[].lineNumber` and `rawText` identify the projected line; validity and
 *   diagnostics are host-owned.
 * - `ScratchpadExecutionReceipt` is `{ lineNumber, rawText, macroName,
 *   success, result?, error?, executedAt }` in Macro. Canonical command IDs for
 *   line/range/valid-line execution remain Phase 7 work.
 */
