import { describe, expect, test } from "bun:test";
import { createDiagnosticHostClient } from "../src/dev/diagnostic-host-client";
import { toScratchpadDiagnosticDto } from "../src/server/editor/editor-projections";

describe("host-owned scratchpad projection", () => {
	test("exposes revisioned logical lines and projected diagnostics", async () => {
		const snapshot = await createDiagnosticHostClient().getSnapshot();
		expect(snapshot.editor.activeDocument).toEqual({
			documentId: "fixture-document",
			textRevision: 0,
			lines: [],
		});
	});

	test("projects legacy Macro diagnostics with a messageKey derived from their code", () => {
		expect(
			toScratchpadDiagnosticDto(
				{ code: "NO_MATCH", message: "Invalid macro" },
				false,
			),
		).toEqual({
			severity: "error",
			code: "NO_MATCH",
			messageKey: "NO_MATCH",
		});
	});

	test("projects structured Macro diagnostics by forwarding messageKey and messageParams", () => {
		expect(
			toScratchpadDiagnosticDto(
				{
					code: "INVALID_CANDIDATE_PROVENANCE",
					message: "Candidate provenance is invalid",
					messageKey: "errors.invalidCandidateProvenance",
					messageParams: { reason: "untrusted-source" },
				},
				false,
			),
		).toEqual({
			severity: "error",
			code: "INVALID_CANDIDATE_PROVENANCE",
			messageKey: "errors.invalidCandidateProvenance",
			messageParams: { reason: "untrusted-source" },
		});
	});

	test("always carries a structured messageKey, never a human-readable message", () => {
		expect(
			toScratchpadDiagnosticDto(
				{ code: "NO_MATCH", message: "Invalid macro" },
				true,
			),
		).toEqual({
			severity: "info",
			code: "NO_MATCH",
			messageKey: "NO_MATCH",
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
