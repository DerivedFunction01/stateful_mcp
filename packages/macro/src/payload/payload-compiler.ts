import type { MacroArgumentMatch } from "../contracts/matching";
import type { MacroParseResult, ArgumentState } from "../contracts/payload";
import type { MacroDiagnostic } from "../contracts/input";
import type {
	MacroArgumentSpec,
	MacroParseOptions,
	MacroSpec,
} from "../contracts/macro";
import type { GenericValue } from "../contracts/values";
import { parseMacroLine } from "../parser/macro-parser";

export function compileMacroPayload(
	spec: MacroSpec,
	raw: string,
	options: MacroParseOptions = {},
): MacroParseResult {
	const parsed = parseMacroLine(raw, spec, options);
	if (!parsed) {
		return {
			status: "invalid",
			macro: { id: spec.id, name: spec.name },
			arguments: [],
			payload: {},
			diagnostics: [{ code: "NO_MATCH", message: "Input is not a macro line" }],
		};
	}

	const diagnostics: MacroDiagnostic[] = [...parsed.diagnostics];
	const results = spec.arguments.map((argument) => {
		const match = parsed.matches.find((candidate) => candidate.argumentId === argument.argumentId);
		return createArgumentResult(argument, match, options.mode ?? "live", diagnostics);
	});
	const payload: Record<string, unknown> = {};
	for (const result of results) {
		if (result.state === "unset" || result.state === "invalid") continue;
		if (result.value === undefined) continue;
		writePath(payload, result.path, result.value, result, diagnostics);
	}

	const hasInvalid = diagnostics.some((diagnostic) =>
		["INVALID_PATTERN", "NORMALIZATION_FAILED", "PATH_CONFLICT", "INVALID_PATH", "AMBIGUOUS_MATCH"].includes(diagnostic.code),
	);
	const hasIncomplete = results.some((result) => result.state === "pending" || result.state === "unset");
	return {
		status: hasInvalid ? "invalid" : hasIncomplete ? "incomplete" : "matched",
		macro: { id: spec.id, name: spec.name },
		arguments: results,
		payload,
		diagnostics,
	};
}

function createArgumentResult(
	argument: MacroArgumentSpec,
	match: MacroArgumentMatch | undefined,
	mode: "live" | "execute",
	diagnostics: MacroDiagnostic[],
) {
	if (!match) {
		return {
			argumentId: argument.argumentId,
			name: argument.name,
			path: argument.path,
			state: "unset" as ArgumentState,
		};
	}
	const state: ArgumentState =
		match.matchKind === "prefix" && mode === "live" ? "pending" : "locked";
	let value: unknown = match.canonicalValue ?? match.rawValue;
	try {
		if (argument.normalize) value = argument.normalize(match.rawValue, match.captures ?? {});
		else value = normalizeValue(argument, value);
	} catch (error) {
		diagnostics.push({
			code: "NORMALIZATION_FAILED",
			argumentId: argument.argumentId,
			message: error instanceof Error ? error.message : `Unable to normalize '${argument.name}'`,
		});
		return {
			argumentId: argument.argumentId,
			name: argument.name,
			path: argument.path,
			state: "invalid" as ArgumentState,
			rawText: match.rawValue,
			match,
		};
	}
	return {
		argumentId: argument.argumentId,
		name: argument.name,
		path: argument.path,
		state,
		rawText: match.rawValue,
		value,
		match,
	};
}

function normalizeValue(argument: MacroArgumentSpec, value: unknown): unknown {
	if (argument.valueKind === "quantity" || argument.valueKind === "date-time" || argument.valueKind === "custom") return value;
	if (argument.scalarType === "integer") {
		const parsed = Number.parseInt(String(value), 10);
		if (!Number.isInteger(parsed)) throw new Error(`Argument '${argument.name}' is not an integer`);
		checkBounds(argument, parsed);
		return parsed;
	}
	if (argument.scalarType === "number") {
		const parsed = Number(value);
		if (!Number.isFinite(parsed)) throw new Error(`Argument '${argument.name}' is not a number`);
		checkBounds(argument, parsed);
		return parsed;
	}
	if (argument.scalarType === "boolean") {
		if (value === true || value === false) return value;
		if (String(value).toLocaleLowerCase() === "true") return true;
		if (String(value).toLocaleLowerCase() === "false") return false;
		throw new Error(`Argument '${argument.name}' is not boolean`);
	}
	if (argument.repeatable) return String(value).split(argument.itemDelimiter ?? ",").map((item) => item.trim()).filter(Boolean);
	return value;
}

function checkBounds(argument: MacroArgumentSpec, value: number): void {
	const bounds = argument.numericBounds;
	if (!bounds) return;
	if (bounds.min !== undefined && (bounds.inclusiveMin === false ? value <= bounds.min : value < bounds.min)) throw new Error(`Argument '${argument.name}' is below its minimum`);
	if (bounds.max !== undefined && (bounds.inclusiveMax === false ? value >= bounds.max : value > bounds.max)) throw new Error(`Argument '${argument.name}' is above its maximum`);
}

function writePath(
	payload: Record<string, unknown>,
	path: string,
	value: unknown,
	result: { argumentId: string },
	diagnostics: MacroDiagnostic[],
): void {
	const parts = path.split(".");
	if (!parts.length || parts.some((part) => !part)) {
		diagnostics.push({ code: "INVALID_PATH", argumentId: result.argumentId, message: `Invalid payload path '${path}'` });
		return;
	}
	let current: Record<string, unknown> = payload;
	for (const part of parts.slice(0, -1)) {
		const existing = current[part];
		if (existing === undefined) {
			const next: Record<string, unknown> = {};
			current[part] = next;
			current = next;
		} else if (isRecord(existing)) {
			current = existing;
		} else {
			diagnostics.push({ code: "PATH_CONFLICT", argumentId: result.argumentId, message: `Payload path '${path}' conflicts with an existing value` });
			return;
		}
	}
	const leaf = parts[parts.length - 1]!;
	if (current[leaf] !== undefined) {
		diagnostics.push({ code: "PATH_CONFLICT", argumentId: result.argumentId, message: `Payload path '${path}' was written more than once` });
		return;
	}
	current[leaf] = toJsonValue(value);
}

function toJsonValue(value: unknown): unknown {
	if (isGenericValue(value)) return value;
	return value;
}

function isGenericValue(value: unknown): value is GenericValue {
	return typeof value === "object" && value !== null && "kind" in value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
