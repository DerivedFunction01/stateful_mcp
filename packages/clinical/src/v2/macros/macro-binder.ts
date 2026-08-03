/**
 * V2 macro binder.
 *
 * Maps a lexed `MacroInput` (raw argument tokens) onto a resolved macro
 * definition's argument specs, matching named/positional/aliased arguments and
 * enforcing explicit inference policy. Produces a `MacroBindingResult` without
 * constructing `ParsedItem` or importing the retired parser stack.
 */

import type { MacroArgumentSpec, V2MacroDefinition } from "./macro-definition";
import type {
	MacroArgumentBinding,
	MacroArgumentInput,
	MacroBindingIssue,
	MacroBindingResult,
	MacroInput,
} from "./macro-binding";

export interface MacroBindingOptions {
	/** Allow arguments with no explicit name to map positionally. */
	allowPositional?: boolean;
	/** Permit argument-name inference from aliases/roleName. */
	allowInference?: boolean;
}

export function bindMacro(
	input: MacroInput,
	definition: V2MacroDefinition,
	options: MacroBindingOptions = {},
): MacroBindingResult {
	const issues: MacroBindingIssue[] = [];
	const bindings: MacroArgumentBinding[] = [];
	const allowPositional = options.allowPositional ?? true;
	const allowInference = options.allowInference ?? true;

	const specs = new Map<string, MacroArgumentSpec>();
	for (const spec of definition.arguments) {
		if (specs.has(spec.argumentId)) {
			issues.push({
				code: "DUPLICATE_ARGUMENT",
				argumentId: spec.argumentId,
				message: `Duplicate argument '${spec.argumentId}'`,
			});
		}
		specs.set(spec.argumentId, spec);
	}

	const boundIds = new Set<string>();
	input.arguments.forEach((arg) => {
		const spec = resolveSpec(arg, definition, allowPositional, allowInference);
		if (!spec) {
			issues.push({
				code: "UNKNOWN_ARGUMENT",
				argumentId: arg.name,
				message: `Unknown argument '${arg.name ?? arg.position}'`,
			});
			return;
		}
		if (boundIds.has(spec.argumentId)) {
			issues.push({
				code: "DUPLICATE_ARGUMENT",
				argumentId: spec.argumentId,
				message: `Duplicate assignment to '${spec.name}'`,
			});
			return;
		}
		boundIds.add(spec.argumentId);
		if (arg.rawValue.trim().length === 0 && spec.blankPolicy === "reject") {
			issues.push({
				code: "EMPTY_VALUE",
				argumentId: spec.argumentId,
				message: `Argument '${spec.name}' cannot be blank`,
			});
		}
		bindings.push({
			argumentId: spec.argumentId,
			name: spec.name,
			rawValue: arg.rawValue,
			source: arg.source,
		});
	});

	// Enforce required arguments
	for (const spec of definition.arguments) {
		const required = spec.required ?? spec.extraction.required ?? false;
		if (required && !boundIds.has(spec.argumentId)) {
			issues.push({
				code: "MISSING_REQUIRED",
				argumentId: spec.argumentId,
				message: `Missing required argument '${spec.name}'`,
			});
		}
	}

	return {
		input,
		definitionRef: {
			macroId: definition.macroId,
			macroName: definition.macroName,
			version: definition.version,
		},
		bindings,
		issues,
	};
}

function resolveSpec(
	arg: MacroArgumentInput,
	definition: V2MacroDefinition,
	allowPositional: boolean,
	allowInference: boolean,
): MacroArgumentSpec | undefined {
	if (arg.source === "positional") {
		if (!allowPositional) return undefined;
		return definition.arguments.find((spec) => spec.position === arg.position);
	}
	if (arg.source === "named" || arg.source === "inferred") {
		if (arg.name) {
			const byName = definition.arguments.find(
				(spec) =>
					spec.name.toLowerCase() === arg.name!.toLowerCase() ||
					spec.aliases?.some((a) => a.toLowerCase() === arg.name!.toLowerCase()),
			);
			if (byName) return byName;
			if (allowInference) {
				return definition.arguments.find(
					(spec) => spec.roleName.toLowerCase().endsWith(arg.name!.toLowerCase()),
				);
			}
		}
		if (allowPositional) {
			const byName = definition.arguments.find(
				(spec) => spec.position === arg.position,
			);
			if (byName) return byName;
		}
	}
	return undefined;
}
