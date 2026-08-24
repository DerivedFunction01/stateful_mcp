import type { MacroDiagnostic, MacroDiagnosticCode } from "../contracts/input";
import type {
	MacroArgumentSpec,
	MacroParseOptions,
	MacroRunMode,
	MacroSpec,
} from "../contracts/macro";
import type { MacroArgumentMatch } from "../contracts/matching";
import type { ArgumentState, MacroParseResult } from "../contracts/payload";
import type { AcceptedMacroLock } from "../contracts/slots";
import type { GenericValue } from "../contracts/values";
import { parseMacroLine } from "../parser/macro-parser";

const INVALID_PAYLOAD_DIAGNOSTICS: ReadonlySet<MacroDiagnosticCode> =
	new Set<MacroDiagnosticCode>([
		"INVALID_PATTERN",
		"NORMALIZATION_FAILED",
		"PATH_CONFLICT",
		"INVALID_PATH",
		"AMBIGUOUS_MATCH",
	]);

/** Structured descriptor key for a normalizer that threw. */
const NORMALIZATION_FAILED_KEY = "errors.normalizationFailed";

export interface MacroPayloadCompileOptions extends MacroParseOptions {
	acceptedLocks?: readonly AcceptedMacroLock[];
}

export function compileMacroPayload(
	spec: MacroSpec,
	raw: string,
	options: MacroPayloadCompileOptions,
): MacroParseResult {
	const parsed = parseMacroLine(raw, spec, options);
	if (!parsed) {
		return {
			status: "invalid",
			macro: { id: spec.id, name: spec.name },
			arguments: [],
			payload: {},
			diagnostics: [
				{
					code: "NO_MATCH",
					message: "errors.notAMacroLine",
					messageKey: "errors.notAMacroLine",
				},
			],
		};
	}

	const diagnostics: MacroDiagnostic[] = [...parsed.diagnostics];
	const matches = materializeAcceptedLocks(
		spec,
		raw,
		parsed.matches,
		options.acceptedLocks ?? [],
	);
	const results = spec.arguments.map((argument) => {
		const match = matches.find(
			(candidate) => candidate.argumentId === argument.argumentId,
		);
		return createArgumentResult(
			argument,
			match,
			options.mode ?? "live",
			diagnostics,
		);
	});
	const payload: Record<string, unknown> = {};
	for (const result of results) {
		if (result.state === "unset" || result.state === "invalid") continue;
		if (result.value === undefined) continue;
		writePath(payload, result.path, result.value, result, diagnostics);
	}

	const hasInvalid = diagnostics.some((diagnostic) =>
		INVALID_PAYLOAD_DIAGNOSTICS.has(diagnostic.code),
	);
	const hasIncomplete = results.some(
		(result) => result.state === "pending" || result.state === "unset",
	);
	return {
		status: hasInvalid ? "invalid" : hasIncomplete ? "incomplete" : "matched",
		macro: { id: spec.id, name: spec.name },
		arguments: results,
		payload,
		diagnostics,
	};
}

function materializeAcceptedLocks(
	spec: MacroSpec,
	raw: string,
	matches: readonly MacroArgumentMatch[],
	locks: readonly AcceptedMacroLock[],
): MacroArgumentMatch[] {
	const currentVersion = spec.version ?? 1;
	const result = [...matches];
	for (const lock of locks) {
		if (lock.macroId !== spec.id || lock.macroVersion !== currentVersion)
			continue;
		if (raw.slice(lock.start, lock.end) !== lock.rawText) continue;
		const existing = result.findIndex(
			(match) =>
				match.argumentId === lock.argumentId &&
				(match.occurrence ?? 0) === lock.occurrence,
		);
		const match: MacroArgumentMatch = {
			argumentId: lock.argumentId,
			occurrence: lock.occurrence,
			source: "accepted",
			extraction: { start: lock.start, end: lock.end },
			rawValue: lock.rawText,
			canonicalValue: lock.binding?.canonicalValue,
			sourceId: lock.candidateId,
			backendId: lock.binding?.backendId,
			matchKind: "exact",
		};
		if (existing >= 0) result[existing] = match;
		else result.push(match);
	}
	return result;
}

function createArgumentResult(
	argument: MacroArgumentSpec,
	match: MacroArgumentMatch | undefined,
	mode: MacroRunMode,
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
		(match.matchKind === "prefix" || match.stability === "unstable") &&
		mode === "live"
			? "pending"
			: "locked";
	let value: unknown = match.canonicalValue ?? match.rawValue;
	try {
		if (argument.normalize)
			value = argument.normalize(match.rawValue, match.captures ?? {});
		else value = normalizeValue(argument, value);
	} catch {
		// Normalizers are extension-authored: their thrown text is developer
		// facing and never localized, so only the structured descriptor is kept.
		diagnostics.push({
			code: "NORMALIZATION_FAILED",
			argumentId: argument.argumentId,
			message: NORMALIZATION_FAILED_KEY,
			messageKey: NORMALIZATION_FAILED_KEY,
			messageParams: { argumentName: argument.name },
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
	if (
		argument.valueKind === "quantity" ||
		argument.valueKind === "date-time" ||
		argument.valueKind === "custom"
	)
		return value;
	if (argument.scalarType === "integer") {
		const parsed = Number.parseInt(String(value), 10);
		if (!Number.isInteger(parsed)) throw new TypeError();
		checkBounds(argument, parsed);
		return parsed;
	}
	if (argument.scalarType === "number") {
		const parsed = Number(value);
		if (!Number.isFinite(parsed)) throw new TypeError();
		checkBounds(argument, parsed);
		return parsed;
	}
	if (argument.scalarType === "boolean") {
		if (value === true || value === false) return value;
		if (String(value).toLocaleLowerCase() === "true") return true;
		if (String(value).toLocaleLowerCase() === "false") return false;
		throw new TypeError();
	}
	if (argument.repeatable)
		return String(value)
			.split(argument.itemDelimiter ?? ",")
			.map((item) => item.trim())
			.filter(Boolean);
	return value;
}

function checkBounds(argument: MacroArgumentSpec, value: number): void {
	const bounds = argument.numericBounds;
	if (!bounds) return;
	if (
		bounds.min !== undefined &&
		(bounds.inclusiveMin === false ? value <= bounds.min : value < bounds.min)
	)
		throw new RangeError();
	if (
		bounds.max !== undefined &&
		(bounds.inclusiveMax === false ? value >= bounds.max : value > bounds.max)
	)
		throw new RangeError();
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
		diagnostics.push({
			code: "INVALID_PATH",
			argumentId: result.argumentId,
			message: "errors.invalidPayloadPath",
			messageKey: "errors.invalidPayloadPath",
			messageParams: { path },
		});
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
			diagnostics.push({
				code: "PATH_CONFLICT",
				argumentId: result.argumentId,
				message: "errors.payloadPathConflict",
				messageKey: "errors.payloadPathConflict",
				messageParams: { path },
			});
			return;
		}
	}
	const leaf = parts[parts.length - 1]!;
	if (current[leaf] !== undefined) {
		diagnostics.push({
			code: "PATH_CONFLICT",
			argumentId: result.argumentId,
			message: "errors.payloadPathDuplicate",
			messageKey: "errors.payloadPathDuplicate",
			messageParams: { path },
		});
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
