import { describe, expect, it } from "bun:test";
import { createAssertionMacro } from "../../src/composition/assertion";
import { createMacroRuntimeContext } from "../../src/contracts/context";
import { ExtensionRuntime } from "../../src/extensions/runtime";
import { CursorBuffer } from "../../src/workspace/editor/cursor-buffer";
import { ScratchpadSession } from "../../src/workspace/scratchpad/scratchpad-session";

describe("ScratchpadSession: Pinned & Frequent Macro Tracking", () => {
	it("tracks macro execution frequency and aggregates pinned/frequent lists", async () => {
		const runtime = new ExtensionRuntime({
			context: createMacroRuntimeContext({ macroStartToken: "^" }),
		});

		const clinicalExt = {
			manifest: {
				id: "@stateful-mcp/clinical",
				name: "Clinical Extension",
				version: "1.0.0",
				contributes: {},
			},
			activate: () => ({
				adapters: [
					createAssertionMacro(
						{
							macroName: "vitals",
							subjectSlotId: "bp",
							clauses: [],
						},
						(graph) => ({ bp: (graph.subject as { term: string }).term }),
						{ syntax: { expressionToken: "#" } },
					),
					createAssertionMacro(
						{
							macroName: "dx",
							subjectSlotId: "term",
							clauses: [],
						},
						(graph) => ({ term: (graph.subject as { term: string }).term }),
						{ syntax: { expressionToken: "#" } },
					),
				],
			}),
		};

		await runtime.activate([
			{
				sourceFile: "/ext/clinical/index.ts",
				extension: clinicalExt as any,
			},
		]);

		const buffer = new CursorBuffer(
			"^vitals #120/80\n^dx #hypertension\n^vitals #130/85",
		);
		const session = new ScratchpadSession(runtime, buffer, 10);
		await session.parseAllLines();

		// Initially, frequency is empty
		expect(session.getFrequentMacros()).toHaveLength(0);

		// Execute line 0 (vitals)
		await session.executeLine(0);
		expect(session.getFrequentMacros()).toEqual([
			{ macroName: "vitals", count: 1 },
		]);

		// Execute line 1 (dx)
		await session.executeLine(1);

		// Execute line 2 (vitals)
		await session.executeLine(2);

		const frequent = session.getFrequentMacros();
		expect(frequent).toEqual([
			{ macroName: "vitals", count: 2 },
			{ macroName: "dx", count: 1 },
		]);

		// Test getQuickRuns with project quick runs
		const quickRuns = session.getQuickRuns(["triage"]);
		expect(
			quickRuns.some((p) => p.macroName === "triage" && p.source === "project"),
		).toBe(true);
		expect(
			quickRuns.some(
				(p) => p.macroName === "vitals" && p.source === "frequent",
			),
		).toBe(true);
		expect(
			quickRuns.some((p) => p.macroName === "dx" && p.source === "frequent"),
		).toBe(true);
	});
});
