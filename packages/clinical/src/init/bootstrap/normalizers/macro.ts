import type { ParserMacro } from "../../../store/interfaces";
import type { ClinicalInitSeedLoadedRecord } from "../../seed/record";

export function normalizeMacro(
	record: ClinicalInitSeedLoadedRecord,
): ParserMacro | null {
	const payload = record.payload as Record<string, unknown> | undefined;
	if (!payload || typeof payload !== "object") return null;
	if (typeof payload.macroId !== "string") return null;
	if (typeof payload.macroName !== "string") return null;
	if (typeof payload.macroTemplate !== "string") return null;
	return payload as unknown as ParserMacro;
}
