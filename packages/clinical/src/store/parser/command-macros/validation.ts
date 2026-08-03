import { isStructuredMacroSlot } from "../../../parser/command/command-macro-authoring-template";
import type {
	CommandMacroArgument,
	CommandMacroPatternRule,
	CommandMacroValidationDiagnostic,
	CommandMacroValueSpec,
	NumericBounds,
	ParserCommandMacro,
} from "./interfaces";

function groupNames(pattern: string): Set<string> {
	const names = new Set<string>();
	const matcher = /\(\?<([A-Za-z_$][\w$]*)>/g;
	for (const match of pattern.matchAll(matcher)) {
		if (match[1]) names.add(match[1]);
	}
	return names;
}

function validatePattern(
	rule: CommandMacroPatternRule,
	path: string,
	diagnostics: CommandMacroValidationDiagnostic[],
): void {
	let names: Set<string>;
	try {
		new RegExp(rule.pattern);
		names = groupNames(rule.pattern);
	} catch (error) {
		diagnostics.push({
			path,
			message: `invalid regular expression: ${String(error)}`,
		});
		return;
	}
	const contract = rule.namedGroupContract;
	for (const name of contract?.required ?? []) {
		if (!names.has(name))
			diagnostics.push({
				path,
				message: `required named group '${name}' is missing`,
			});
	}
	for (const name of contract?.allowed ?? []) {
		if (!names.has(name))
			diagnostics.push({
				path,
				message: `allowed named group '${name}' is missing`,
			});
	}
	for (const name of contract?.disallowed ?? []) {
		if (names.has(name))
			diagnostics.push({
				path,
				message: `disallowed named group '${name}' is present`,
			});
	}
	if (rule.fullSpan && !/^\^.*\$$/.test(rule.pattern)) {
		diagnostics.push({
			path,
			message: "full-span rules must be anchored with ^ and $",
		});
	}
	for (const exclusion of rule.exclusions ?? []) {
		try {
			new RegExp(exclusion.pattern, exclusion.caseSensitive ? "" : "i");
		} catch (error) {
			diagnostics.push({
				path: `${path}.exclusions`,
				message: `invalid exclusion pattern: ${String(error)}`,
			});
		}
	}
}

function validateBounds(
	bounds: NumericBounds | undefined,
	path: string,
	diagnostics: CommandMacroValidationDiagnostic[],
): void {
	if (!bounds) return;
	if (bounds.min !== undefined && !Number.isFinite(bounds.min))
		diagnostics.push({ path, message: "minimum must be finite" });
	if (bounds.max !== undefined && !Number.isFinite(bounds.max))
		diagnostics.push({ path, message: "maximum must be finite" });
	if (
		bounds.min !== undefined &&
		bounds.max !== undefined &&
		bounds.min > bounds.max
	)
		diagnostics.push({ path, message: "minimum cannot exceed maximum" });
}

function validateBoundary(
	boundary:
		| {
				maxLeft?: number;
				maxRight?: number;
				maxCharacters?: number;
				maxWords?: number;
				maxSentences?: number;
				maxParagraphs?: number;
		  }
		| undefined,
	path: string,
	diagnostics: CommandMacroValidationDiagnostic[],
): void {
	if (!boundary) return;
	for (const [key, value] of Object.entries(boundary)) {
		if (
			key.startsWith("max") &&
			value !== undefined &&
			(!Number.isFinite(value) || value < 0)
		)
			diagnostics.push({
				path: `${path}.${key}`,
				message: "boundary limits must be finite and non-negative",
			});
	}
}

function validateSpec(
	spec: CommandMacroValueSpec,
	path: string,
	diagnostics: CommandMacroValidationDiagnostic[],
): void {
	switch (spec.kind) {
		case "concept":
			for (const [index, rule] of (spec.patterns ?? []).entries())
				validatePattern(rule, `${path}.patterns[${index}]`, diagnostics);
			return;
		case "enum": {
			const values = new Set<string>();
			for (const [index, value] of spec.values.entries()) {
				if (!value.value.trim() || values.has(value.value))
					diagnostics.push({
						path: `${path}.values[${index}]`,
						message: "enum values must be non-empty and unique",
					});
				values.add(value.value);
				for (const [ruleIndex, rule] of value.patterns.entries())
					validatePattern(
						rule,
						`${path}.values[${index}].patterns[${ruleIndex}]`,
						diagnostics,
					);
			}
			return;
		}
		case "measurement":
			validatePattern(spec.extraction, `${path}.extraction`, diagnostics);
			if (!spec.dimension.trim())
				diagnostics.push({
					path,
					message: "measurement dimension is required",
				});
			if (!spec.magnitudeGroup || !spec.unitGroup)
				diagnostics.push({ path, message: "measurement groups are required" });
			validateBounds(spec.bounds?.raw, `${path}.bounds.raw`, diagnostics);
			validateBounds(
				spec.bounds?.normalized,
				`${path}.bounds.normalized`,
				diagnostics,
			);
			if (
				spec.units?.allowed &&
				spec.units.denied &&
				spec.units.allowed.some((unit) => spec.units?.denied?.includes(unit))
			)
				diagnostics.push({
					path,
					message: "a unit cannot be both allowed and denied",
				});
			return;
		case "temporal":
		case "scalar":
			validatePattern(spec.extraction, `${path}.extraction`, diagnostics);
			if (spec.kind === "scalar")
				validateBounds(spec.bounds, `${path}.bounds`, diagnostics);
			return;
		case "array":
			validateSpec(spec.item, `${path}.item`, diagnostics);
			return;
		case "prose":
			return;
	}
}

export function validateParserCommandMacro(
	macro: ParserCommandMacro,
): CommandMacroValidationDiagnostic[] {
	const diagnostics: CommandMacroValidationDiagnostic[] = [];
	if (!macro.macroId.trim())
		diagnostics.push({ path: "macroId", message: "macroId is required" });
	if (!macro.macroName.trim())
		diagnostics.push({ path: "macroName", message: "macroName is required" });
	if (!Number.isInteger(macro.version) || macro.version < 1)
		diagnostics.push({
			path: "version",
			message: "version must be a positive integer",
		});
	if (!macro.root.roleName || !macro.root.targetSchema)
		diagnostics.push({
			path: "root",
			message: "root roleName and targetSchema are required",
		});
	validateBoundary(macro.boundary, "boundary", diagnostics);
	if (macro.renderTemplateIds && !macro.renderTemplateIds.preview.trim())
		diagnostics.push({
			path: "renderTemplateIds.preview",
			message: "preview render template ID is required",
		});
	const childNames = new Set<string>();
	for (const [index, child] of (macro.children ?? []).entries()) {
		if (!child.childMacroName.trim())
			diagnostics.push({
				path: `children[${index}]`,
				message: "child macro name is required",
			});
		if (childNames.has(child.childMacroName))
			diagnostics.push({
				path: `children[${index}]`,
				message: `duplicate child macro '${child.childMacroName}'`,
			});
		childNames.add(child.childMacroName);
		if (
			!macro.arguments.some(
				(argument) => argument.roleName === child.parentRoleName,
			)
		)
			diagnostics.push({
				path: `children[${index}].parentRoleName`,
				message: `parent role '${child.parentRoleName}' is not declared by an argument`,
			});
		if (!child.parentTargetPath.trim())
			diagnostics.push({
				path: `children[${index}].parentTargetPath`,
				message: "parent target path is required",
			});
	}
	if (macro.authoringTemplate) {
		if (macro.authoringTemplate.version !== 1)
			diagnostics.push({
				path: "authoringTemplate.version",
				message: "unsupported authoring template version",
			});
		const argumentIds = new Set(
			macro.arguments.map((argument) => argument.argumentId),
		);
		const occurrences = new Set<string>();
		for (const [index, part] of macro.authoringTemplate.parts.entries()) {
			if (part.kind === "literal") continue;
			if (!isStructuredMacroSlot(part))
				diagnostics.push({
					path: `authoringTemplate.parts[${index}]`,
					message: "invalid structured slot",
				});
			if (!argumentIds.has(part.slotId))
				diagnostics.push({
					path: `authoringTemplate.parts[${index}]`,
					message: `slot references unknown argument '${part.slotId}'`,
				});
			const key = `${part.slotId}:${part.occurrence}`;
			if (occurrences.has(key))
				diagnostics.push({
					path: `authoringTemplate.parts[${index}]`,
					message: `duplicate slot occurrence '${key}'`,
				});
			occurrences.add(key);
		}
	}
	const ids = new Set<string>();
	for (const [index, argument] of macro.arguments.entries()) {
		const path = `arguments[${index}]`;
		if (!argument.argumentId || ids.has(argument.argumentId))
			diagnostics.push({
				path,
				message: "argument IDs must be non-empty and unique",
			});
		ids.add(argument.argumentId);
		if (!argument.name.trim() || !argument.roleName.trim())
			diagnostics.push({
				path,
				message: "argument name and roleName are required",
			});
		if (!argument.target.targetSchema || !argument.target.targetPath)
			diagnostics.push({
				path: `${path}.target`,
				message: "target schema and path are required",
			});
		validateBoundary(argument.boundary, `${path}.boundary`, diagnostics);
		validateSpec(argument.extraction, `${path}.extraction`, diagnostics);
	}
	return diagnostics;
}

export function assertValidParserCommandMacro(macro: ParserCommandMacro): void {
	const diagnostics = validateParserCommandMacro(macro);
	if (diagnostics.length)
		throw new Error(
			`Invalid command macro: ${diagnostics.map((item) => `${item.path}: ${item.message}`).join("; ")}`,
		);
}

export function normalizeParserCommandMacro(
	macro: ParserCommandMacro,
): ParserCommandMacro {
	assertValidParserCommandMacro(macro);
	return {
		...macro,
		macroName: macro.macroName.trim(),
		version: macro.version,
		arguments: macro.arguments.map((argument: CommandMacroArgument) => ({
			...argument,
			name: argument.name.trim(),
			aliases: argument.aliases?.map((alias) => alias.trim()).filter(Boolean),
		})),
	};
}
