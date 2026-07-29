import type { DictionaryStore, VariableService } from "@stateful-mcp/core";
import { executePipeline } from "@stateful-mcp/core/src/translation/pipeline";
import type {
	OpName,
	PipelineStep,
} from "@stateful-mcp/core/src/translation/types";
import { resolveConceptHelper } from "./schema-parsers";

export class CdslVariableParser {
	/**
	 * Scans text for variable blocks supporting block naming prefixes (e.g. person{name=John})
	 * and set-membership assertions (e.g. x -> {1,2,3}), resolving values via a shadow-read
	 * branch traversal mechanism.
	 */
	static async parseAndApply(
		text: string,
		variableService: VariableService,
		sessionId: string,
		profile: {
			variableStartToken: string;
			variableEndToken: string;
			variableDelimiter?: string;
			startTermDelimiter?: string;
			termTokenizer?: string;
		},
		dictionaryStore?: DictionaryStore,
	): Promise<string> {
		const startTok = profile.variableStartToken || "{";
		const endTok = profile.variableEndToken || "}";
		const delim = profile.variableDelimiter || ",";

		const escStart = startTok.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
		const escEnd = endTok.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");

		// Match block optionally containing one level of nested start/end tokens (for sets)
		const blockRegex = new RegExp(
			`([a-zA-Z0-9_-]*)${escStart}((?:[^${escStart}${escEnd}]|${escStart}[^${escStart}${escEnd}]*${escEnd})*)${escEnd}`,
			"g",
		);

		let cleanText = text;
		const matches = Array.from(text.matchAll(blockRegex));

		for (const match of matches) {
			const blockName = match[1] || undefined;
			const blockContent = match[2];
			if (!blockContent) continue;

			const statements = blockContent.split(delim).map((s) => s.trim());
			for (const stmt of statements) {
				if (!stmt) continue;

				// 1. Match Set-Membership Assertion: e.g. "x -> {1, 2, 3}" or "x in_set {A, B}"
				const setMatch = stmt.match(
					/^\s*([a-zA-Z0-9_-]+)\s*(->|!->|in_set|not_in_set)\s*\{([^}]+)\}\s*$/,
				);
				if (setMatch) {
					const key = setMatch[1]!;
					const opStr = setMatch[2]!;
					const setStr = setMatch[3]!;

					const op: OpName =
						opStr === "->" || opStr === "in_set" ? "in_set" : "not_in_set";
					const setValues = await Promise.all(
						setStr
							.split(",")
							.map((v) =>
								CdslVariableParser.resolveValue(
									v.trim(),
									profile,
									dictionaryStore,
								),
							),
					);

					const currentVal = await CdslVariableParser.shadowGetVariable(
						variableService,
						sessionId,
						key,
						blockName,
					);

					let passed = false;
					if (CdslVariableParser.isConcept(currentVal)) {
						const matched = setValues.some(
							(v) =>
								CdslVariableParser.isConcept(v) &&
								v.conceptId === currentVal.conceptId,
						);
						passed = op === "in_set" ? matched : !matched;
					} else {
						const testStep: PipelineStep = {
							op,
							args: [currentVal as any, ...(setValues as any[])],
						};
						passed = Boolean(executePipeline([testStep], {}, {}));
					}

					if (!passed) {
						throw new Error(
							`Variable assertion failed: expected ${key} ${opStr} {${setStr}}, but current value is ${currentVal}`,
						);
					}
					continue;
				}

				// 2. Try matching Standard Assertion: e.g. "z > 5", "age >= 18"
				const assertMatch = stmt.match(
					/^\s*([a-zA-Z0-9_-]+)\s*(>=|<=|>|<|!=|==|neq|geq|leq|gt|lt)\s*(.+)$/,
				);
				if (assertMatch) {
					const key = assertMatch[1]!;
					const opStr = assertMatch[2]!;
					const valStr = assertMatch[3]!.trim();

					const op = CdslVariableParser.mapOperator(opStr);
					const expectedValue = await CdslVariableParser.resolveValue(
						valStr,
						profile,
						dictionaryStore,
					);

					const currentVal = await CdslVariableParser.shadowGetVariable(
						variableService,
						sessionId,
						key,
						blockName,
					);

					let passed = false;
					if (
						(op === "eq" || op === "neq") &&
						CdslVariableParser.isConcept(currentVal) &&
						CdslVariableParser.isConcept(expectedValue)
					) {
						const eq = currentVal.conceptId === expectedValue.conceptId;
						passed = op === "eq" ? eq : !eq;
					} else {
						const testStep: PipelineStep = {
							op,
							args: [currentVal as any, expectedValue as any],
						};
						passed = Boolean(executePipeline([testStep], {}, {}));
					}

					if (!passed) {
						throw new Error(
							`Variable assertion failed: expected ${key} ${opStr} ${valStr}, but current value is ${currentVal}`,
						);
					}
					continue;
				}

				// 3. Try matching Assignment: e.g. "x = 10"
				const assignMatch = stmt.match(/^\s*([a-zA-Z0-9_-]+)\s*=\s*(.+)$/);
				if (assignMatch) {
					const key = assignMatch[1]!;
					const valStr = assignMatch[2]!.trim();
					const value = await CdslVariableParser.resolveValue(
						valStr,
						profile,
						dictionaryStore,
					);

					// Assignments are strictly committed locally to the active session/branch scope
					await variableService.setVariable(sessionId, key, value, blockName);
				}
			}

			cleanText = cleanText.replace(match[0], "");
		}

		return cleanText;
	}

	private static isConcept(
		val: unknown,
	): val is { conceptId: string; display: string } {
		return (
			typeof val === "object" &&
			val !== null &&
			typeof (val as any).conceptId === "string"
		);
	}

	/**
	 * Shadow-Read / Context Scope Chaining:
	 * Resolves a variable by traversing up the branch hierarchy (split by /) if undefined in local branch scope.
	 */
	private static async shadowGetVariable(
		service: VariableService,
		sessionId: string,
		key: string,
		blockName?: string,
	): Promise<unknown> {
		let currentSessionId = sessionId;
		while (true) {
			const val = await service.getVariable(currentSessionId, key, blockName);
			if (val !== undefined) return val;

			const slashIndex = currentSessionId.lastIndexOf("/");
			if (slashIndex === -1) break;
			currentSessionId = currentSessionId.substring(0, slashIndex);
		}
		return undefined;
	}

	private static async resolveValue(
		valStr: string,
		profile: {
			startTermDelimiter?: string;
			termTokenizer?: string;
		},
		dictionaryStore?: DictionaryStore,
	): Promise<unknown> {
		const parsedVal = CdslVariableParser.parseValue(valStr);
		const startTermDelim = profile.startTermDelimiter || "@";
		const tokenizer = profile.termTokenizer || "::";

		const isConceptRef =
			typeof parsedVal === "string" &&
			(parsedVal.startsWith(startTermDelim) || parsedVal.includes(tokenizer));

		if (isConceptRef && typeof parsedVal === "string" && dictionaryStore) {
			let lookupText = parsedVal;
			if (lookupText.startsWith(startTermDelim)) {
				lookupText = lookupText.slice(startTermDelim.length).trim();
			}
			const resolved = await resolveConceptHelper(
				lookupText,
				dictionaryStore,
				profile.termTokenizer,
			);
			if (resolved && resolved.length > 0) {
				return resolved[0];
			}
		}
		return parsedVal;
	}

	private static mapOperator(op: string): OpName {
		switch (op) {
			case "=":
			case "==":
			case "eq":
				return "eq";
			case "!=":
			case "neq":
				return "neq";
			case "<":
			case "lt":
				return "lt";
			case "<=":
			case "leq":
				return "leq";
			case ">":
			case "gt":
				return "gt";
			case ">=":
			case "geq":
				return "geq";
			default:
				throw new Error(`Unsupported variable operator: ${op}`);
		}
	}

	private static parseValue(val: string): unknown {
		if (val === "true") return true;
		if (val === "false") return false;
		const num = Number(val);
		if (!Number.isNaN(num) && val !== "") return num;
		if (
			(val.startsWith('"') && val.endsWith('"')) ||
			(val.startsWith("'") && val.endsWith("'"))
		) {
			return val.slice(1, -1);
		}
		return val;
	}
}
