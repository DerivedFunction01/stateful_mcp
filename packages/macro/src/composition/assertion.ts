import type {
	MacroChildBinding,
	MacroChildHandler,
	MacroChildValidationContext,
	MacroDefinitionAdapter,
} from "../contracts/composition";
import type {
	CompiledDomainGrammar,
	UserMacroProfile,
} from "../contracts/extension-config";
import type { MacroInput } from "../contracts/input";
import type { MacroArgumentSpec, MacroSpec } from "../contracts/macro";
import type {
	MacroArgumentForm,
	MacroAuthoringTemplate,
} from "../contracts/matching";
import type { ScannerSyntax } from "../parser/macro-scanner";
import {
	type PatternCompilerValueKind,
	ValuePatternCompiler,
} from "../values/pattern-compiler";

export type AssertionClauseRole =
	| "subject"
	| "supporting"
	| "refuting"
	| "qualifier"
	| "transition";

export type AssertionClauseValueKind = PatternCompilerValueKind;

export interface AssertionClauseSpec {
	readonly role: AssertionClauseRole;
	readonly slotId: string;
	readonly valueKind: AssertionClauseValueKind;
	readonly repeatable?: boolean;
	readonly connectors?: readonly string[];
}

export const ASSERTION_POLARITIES = ["affirmative", "ruled_out"] as const;
export type AssertionPolarity = (typeof ASSERTION_POLARITIES)[number];

export interface CompositeAssertionSpec {
	readonly macroName: string;
	readonly id?: string;
	readonly description?: string;
	readonly subjectSlotId: string;
	readonly subjectValueKind?: AssertionClauseValueKind;
	readonly clauses: readonly AssertionClauseSpec[];
	readonly defaultPolarity?: AssertionPolarity;
}

export interface AssertionClauseBinding {
	readonly role: AssertionClauseRole;
	readonly slotId: string;
	readonly rawValue: string;
	readonly value: unknown;
}

export interface CompositeAssertionGraph {
	readonly subject: unknown;
	readonly polarity: AssertionPolarity;
	readonly qualifiers: Readonly<Record<string, unknown>>;
	readonly evidence: readonly AssertionClauseBinding[];
	readonly transitions: readonly AssertionClauseBinding[];
}

export interface CreateAssertionMacroOptions {
	readonly grammar?: CompiledDomainGrammar | Partial<UserMacroProfile>;
	readonly syntax?: ScannerSyntax;
}

/**
 * Creates a domain-neutral composite assertion macro adapter based on relational evidence clauses
 * (subject + qualifiers + supporting/refuting evidence + action triggers).
 */
export function createAssertionMacro(
	spec: CompositeAssertionSpec,
	compileHandler: (
		graph: CompositeAssertionGraph,
		input: MacroInput,
	) => unknown | Promise<unknown>,
	options: CreateAssertionMacroOptions = {},
): MacroDefinitionAdapter {
	const compiler = new ValuePatternCompiler({
		grammar: options.grammar,
		syntax: options.syntax,
	});

	const subjectPattern =
		spec.subjectValueKind === "string"
			? compiler.compileWordPattern()
			: compiler.compileConceptPattern();

	const subjectArg: MacroArgumentSpec = {
		argumentId: spec.subjectSlotId,
		name: spec.subjectSlotId,
		path: `${spec.macroName}.${spec.subjectSlotId}`,
		matcher: { kind: "pattern", pattern: subjectPattern },
		required: true,
	};

	const clauseArgs: MacroArgumentSpec[] = spec.clauses.map((clause) => {
		let pattern: string;
		if (clause.valueKind === "concept") {
			pattern = compiler.compileConceptPattern();
		} else if (clause.valueKind === "quantity") {
			pattern = compiler.compileQuantityPattern();
		} else if (clause.valueKind === "currency") {
			pattern = compiler.compileCurrencyPattern();
		} else if (clause.valueKind === "date") {
			pattern = compiler.compileDatePattern();
		} else {
			pattern = compiler.compileWordPattern();
		}

		const expandedConnectors = new Set<string>();
		for (const conn of clause.connectors ?? []) {
			if (!conn.includes(clause.slotId)) {
				expandedConnectors.add(`${conn} ${clause.slotId}`);
			}
			expandedConnectors.add(conn);
		}
		if (clause.connectors && clause.connectors.length > 0) {
			expandedConnectors.add(clause.slotId);
		}

		// Sort connectors by length descending so longer phrases match first
		const sortedConnectors = Array.from(expandedConnectors).sort(
			(a, b) => b.length - a.length,
		);

		const forms: MacroArgumentForm[] = sortedConnectors.map(
			(connector, index) => ({
				formId: `${spec.macroName}:${clause.slotId}:${connector}:${index}`,
				kind: "friendly" as const,
				argumentId: clause.slotId,
				template: {
					version: 1 as const,
					parts: [
						{ kind: "literal" as const, text: `${connector} ` },
						{
							kind: "slot" as const,
							argumentId: clause.slotId,
							occurrence: 0,
						},
					],
				},
			}),
		);

		return {
			argumentId: clause.slotId,
			name: clause.slotId,
			path: `${spec.macroName}.${clause.slotId}`,
			matcher: { kind: "pattern", pattern },
			required: false,
			forms: forms.length > 0 ? forms : undefined,
		};
	});

	const definition: MacroSpec = {
		id: spec.id ?? `macro:${spec.macroName}`,
		name: spec.macroName,
		arguments: [subjectArg, ...clauseArgs],
		authoringTemplates: [
			{
				version: 1,
				parts: [
					{
						kind: "slot",
						argumentId: spec.subjectSlotId,
						occurrence: 0,
					},
					...spec.clauses.flatMap((c) => [
						{ kind: "literal" as const, text: ` ${c.slotId} ` },
						{
							kind: "slot" as const,
							argumentId: c.slotId,
							occurrence: 0,
						},
					]),
				],
			},
		],
	};

	const previewTemplate: MacroAuthoringTemplate = {
		version: 1,
		parts: [
			{ kind: "literal", text: `${spec.macroName} ` },
			{ kind: "slot", argumentId: spec.subjectSlotId, occurrence: 0 },
			...spec.clauses.flatMap((c) => [
				{ kind: "literal" as const, text: ` ${c.slotId}: ` },
				{ kind: "slot" as const, argumentId: c.slotId, occurrence: 0 },
			]),
		],
	};

	const children: Record<string, MacroChildHandler> = {};
	children[spec.subjectSlotId] = {
		type: "assertion-subject",
		validate: (context: MacroChildValidationContext) => {
			const raw = context.input.rawValue;
			const value = compiler.parseClauseValue(
				spec.subjectValueKind ?? "concept",
				raw,
			);
			return {
				status: "accepted",
				binding: { canonicalValue: value },
				previewValues: [
					{
						argumentId: spec.subjectSlotId,
						value: raw,
						status: "bound",
					},
				],
			};
		},
	};

	for (const clause of spec.clauses) {
		children[clause.slotId] = {
			type: `assertion-clause-${clause.role}`,
			validate: (context: MacroChildValidationContext) => {
				const raw = context.input.rawValue;
				const value = compiler.parseClauseValue(clause.valueKind, raw);
				return {
					status: "accepted",
					binding: { canonicalValue: value },
					previewValues: [
						{
							argumentId: clause.slotId,
							value: raw,
							status: "bound",
						},
					],
				};
			},
		};
	}

	return {
		definition,
		previewTemplate,
		children,
		compile: async (
			_bindings: readonly MacroChildBinding[],
			input: MacroInput,
		) => {
			let subjectValue: unknown = undefined;
			let polarity: AssertionPolarity =
				spec.defaultPolarity ?? "affirmative";
			const qualifiers: Record<string, unknown> = {};
			const evidence: AssertionClauseBinding[] = [];
			const transitions: AssertionClauseBinding[] = [];

			// Read subject and clause inputs from input arguments
			const subjectInput = input.arguments.find(
				(a) =>
					a.match?.argumentId === spec.subjectSlotId ||
					a.name === spec.subjectSlotId,
			);
			if (subjectInput) {
				subjectValue = compiler.parseClauseValue(
					spec.subjectValueKind ?? "concept",
					subjectInput.rawValue,
				);
			}

			for (const clause of spec.clauses) {
				const matchingInputs = input.arguments.filter(
					(a) =>
						a.match?.argumentId === clause.slotId ||
						a.name === clause.slotId,
				);
				for (const match of matchingInputs) {
					const parsed = compiler.parseClauseValue(
						clause.valueKind,
						match.rawValue,
					);
					const clauseBinding: AssertionClauseBinding = {
						role: clause.role,
						slotId: clause.slotId,
						rawValue: match.rawValue,
						value: parsed,
					};

					if (clause.role === "qualifier") {
						qualifiers[clause.slotId] = parsed;
						if (
							clause.slotId === "polarity" &&
							match.rawValue.toLowerCase().includes("rule")
						) {
							polarity = "ruled_out";
						}
					} else if (
						clause.role === "supporting" ||
						clause.role === "refuting"
					) {
						evidence.push(clauseBinding);
					} else if (clause.role === "transition") {
						transitions.push(clauseBinding);
					}
				}
			}

			const graph: CompositeAssertionGraph = {
				subject: subjectValue,
				polarity,
				qualifiers,
				evidence,
				transitions,
			};

			return compileHandler(graph, input);
		},
	};
}
