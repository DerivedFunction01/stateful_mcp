import type { DictionaryStore, VariableService } from "@stateful-mcp/core";
import { executePipeline } from "@stateful-mcp/core/src/translation/pipeline";
import type {
	OpName,
	PipelineStep,
} from "@stateful-mcp/core/src/translation/types";
import { resolveConceptHelper } from "./schema-parsers";

export class CdslVariableParser {
	/**
	 * Scans text for canonical variable commands (e.g. /set, /assert, /eval)
	 * and variable blocks (e.g. {x=10}, person{name=John}), applies assignments,
	 * and runs assertion checks.
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
			commandMappings?: Record<string, "set" | "assert" | "eval">;
		},
		dictionaryStore?: DictionaryStore,
	): Promise<string> {
		const startTok = profile.variableStartToken || "{";
		const endTok = profile.variableEndToken || "}";
		const delim = profile.variableDelimiter || ",";

		const escStart = startTok.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
		const escEnd = endTok.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");

		// Regexp to match block: e.g. person{name=John} or {x=10}
		const blockRegex = new RegExp(
			`([a-zA-Z0-9_-]*)${escStart}((?:[^${escStart}${escEnd}]|${escStart}[^${escStart}${escEnd}]*${escEnd})*)${escEnd}`,
		);

		let cleanText = text;

		// 1. Process line-by-line slash commands (e.g. /set x = 10, /assert person{age > 30})
		const lines = cleanText.split("\n");
		const cleanLines: string[] = [];

		for (const line of lines) {
			const commandMatch = line.match(/^\s*\/([a-zA-Z0-9_-]+)\s+(.+)$/);
			if (commandMatch) {
				const rawVerb = commandMatch[1]!.toLowerCase();
				const body = commandMatch[2]!.trim();

				const cmd = (profile.commandMappings?.[rawVerb] || rawVerb) as
					| "set"
					| "assert"
					| "eval";

				if (cmd === "set" || cmd === "assert" || cmd === "eval") {
					// Check if body is a block: e.g. personnel{age = 30}
					const blockMatch = body.match(blockRegex);
					if (blockMatch) {
						const blockName = blockMatch[1] || undefined;
						const blockContent = blockMatch[2]!;
						const statements = CdslVariableParser.splitStatements(
							blockContent,
							delim,
						);
						for (const stmt of statements) {
							if (!stmt) continue;
							await CdslVariableParser.executeStatement(
								stmt,
								cmd,
								blockName,
								variableService,
								sessionId,
								profile,
								dictionaryStore,
							);
						}
					} else {
						// Body is a plain list of statements: e.g. x = 10, y = true
						const statements = CdslVariableParser.splitStatements(body, delim);
						for (const stmt of statements) {
							if (!stmt) continue;
							await CdslVariableParser.executeStatement(
								stmt,
								cmd,
								undefined,
								variableService,
								sessionId,
								profile,
								dictionaryStore,
							);
						}
					}
					// Strip the command line completely
					continue;
				}
			}
			cleanLines.push(line);
		}

		cleanText = cleanLines.join("\n");

		// 2. Process inline variable blocks (e.g. {x=10}, person{name=John})
		while (true) {
			const match = cleanText.match(blockRegex);
			if (!match) break;

			const blockName = match[1] || undefined;
			const blockContent = match[2];
			if (blockContent) {
				const statements = CdslVariableParser.splitStatements(
					blockContent,
					delim,
				);
				for (const stmt of statements) {
					if (!stmt) continue;
					await CdslVariableParser.executeStatement(
						stmt,
						undefined,
						blockName,
						variableService,
						sessionId,
						profile,
						dictionaryStore,
					);
				}
			}
			cleanText = cleanText.replace(match[0], "");
		}

		return cleanText;
	}

	private static async executeStatement(
		stmt: string,
		forceMode: "set" | "assert" | "eval" | undefined,
		blockName: string | undefined,
		variableService: VariableService,
		sessionId: string,
		profile: any,
		dictionaryStore?: DictionaryStore,
	): Promise<void> {
		// 1. Match Set-Membership Assertion: e.g. "x -> {1, 2, 3}" or "x !-> {A, B}"
		const setMatch = stmt.match(
			/^\s*([a-zA-Z0-9_-]+)\s*(->|!->)\s*\{([^}]+)\}\s*$/,
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
						CdslVariableParser.resolveValue(v.trim(), profile, dictionaryStore),
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
			return;
		}

		// 2. Try matching Standard Assertion: e.g. "z > 5", "age >= 18"
		const assertMatch = stmt.match(
			/^\s*([a-zA-Z0-9_-]+)\s*(>=|<=|>|<|!=|==)\s*(.+)$/,
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
			return;
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

			if (forceMode === "assert" || forceMode === "eval") {
				const currentVal = await CdslVariableParser.shadowGetVariable(
					variableService,
					sessionId,
					key,
					blockName,
				);
				let passed = false;
				if (
					CdslVariableParser.isConcept(currentVal) &&
					CdslVariableParser.isConcept(value)
				) {
					passed = currentVal.conceptId === value.conceptId;
				} else {
					const testStep: PipelineStep = {
						op: "eq",
						args: [currentVal as any, value as any],
					};
					passed = Boolean(executePipeline([testStep], {}, {}));
				}
				if (!passed) {
					throw new Error(
						`Variable assertion failed: expected ${key} == ${valStr}, but current value is ${currentVal}`,
					);
				}
				return;
			}

			// Assignments are strictly committed locally to the active session/branch scope
			await variableService.setVariable(sessionId, key, value, blockName);
			return;
		}

		throw new Error(`Invalid variable statement: ${stmt}`);
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

	private static splitStatements(str: string, delim: string): string[] {
		const result: string[] = [];
		let current = "";
		let depth = 0;
		for (let i = 0; i < str.length; i++) {
			const char = str[i];
			if (char === "{") depth++;
			else if (char === "}") depth--;

			if (char === delim && depth === 0) {
				result.push(current.trim());
				current = "";
			} else {
				current += char;
			}
		}
		if (current.trim()) {
			result.push(current.trim());
		}
		return result;
	}
}
