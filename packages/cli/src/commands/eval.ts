import type { ClinicalEngine } from "@stateful-mcp/clinical/engine/clinical-engine";
import { formatParsedItems, printJson } from "../formatter/format-parsed";

export async function handleEval(
	engine: ClinicalEngine,
	sessionId: string,
	args: string[],
): Promise<void> {
	const text = args.join(" ");
	if (!text) {
		console.error("usage: clinical eval [--json] <cdsl-text>");
		process.exit(1);
	}

	const note = await engine.processCdsl(sessionId, text);
	if (!note) {
		console.error("eval: engine did not return a result");
		process.exit(1);
	}

	// processCdsl returns the SoapNote; for a headless eval we show
	// what got reconciled into the note. This is a simplification;
	// a full preview path would use CellProcessor.preview().
	const result = formatParsedItems([]);
	printJson({
		sessionId,
		targetSchema: "unknown",
		rawInput: text,
		noteSections: Object.keys(note),
	});
}
