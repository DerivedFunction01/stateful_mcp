import {
	type CompiledDomainGrammar,
	isRecord,
	parseConfiguredValue,
} from "@stateful-mcp/macro";
import type {
	ValueCatalogDto,
	ValuePreviewDto,
	ValueRequestDto,
	ValueSampleDto,
	ValueSampleResultDto,
} from "@stateful-mcp/macro-protocol";

export interface SampleTerminals {
	readonly [terminalId: string]: unknown;
}

/** Projects a runtime canonical value into a JSON-safe transport value. */
export function jsonSafe(value: unknown): unknown {
	if (
		value === undefined ||
		value === null ||
		typeof value === "string" ||
		typeof value === "number" ||
		typeof value === "boolean"
	)
		return value === undefined ? undefined : value;
	if (Array.isArray(value)) {
		const projected = value.map(jsonSafe);
		return projected.some((entry) => entry === undefined)
			? undefined
			: projected;
	}
	if (isRecord(value)) {
		const record: Record<string, unknown> = {};
		for (const [key, child] of Object.entries(value)) {
			const projected = jsonSafe(child);
			if (projected === undefined) return undefined;
			record[key] = projected;
		}
		return record;
	}
	return undefined;
}

export function projectCatalog(
	grammar: CompiledDomainGrammar,
	builtinTerminalIds: readonly string[],
	providerIds?: readonly string[],
): ValueCatalogDto {
	const recipes = (grammar.recipes?.recipes ?? []).map((recipe) => ({
		id: recipe.id,
		valueKind: recipe.capability?.valueKind,
		providedFields: recipe.capability?.providedFields,
	}));
	const valueKinds = [
		...new Set(
			recipes
				.map((recipe) => recipe.valueKind)
				.filter((kind): kind is string => typeof kind === "string"),
		),
	];
	return {
		valueKinds,
		terminalIds: [...builtinTerminalIds],
		recipes,
		...(providerIds ? { providerIds: [...providerIds] } : {}),
	};
}

export function runValueSamples(options: {
	readonly grammar: CompiledDomainGrammar;
	readonly profileFingerprint: string;
	readonly samples: readonly ValueSampleDto[];
	readonly request?: ValueRequestDto;
	readonly terminals: SampleTerminals;
	readonly outputBuilders: Readonly<Record<string, unknown>>;
}): ValuePreviewDto {
	if (options.samples.length > 5) {
		throw new Error("Too many preview samples");
	}
	return {
		graphFingerprint: options.profileFingerprint,
		samples: options.samples.map((sample) =>
			runSingleSample({
				sample,
				request: options.request,
				grammar: options.grammar,
				terminals: options.terminals,
				outputBuilders: options.outputBuilders,
			}),
		),
	};
}

function runSingleSample(options: {
	readonly sample: ValueSampleDto;
	readonly request?: ValueRequestDto;
	readonly grammar: CompiledDomainGrammar;
	readonly terminals: SampleTerminals;
	readonly outputBuilders: Readonly<Record<string, unknown>>;
}): ValueSampleResultDto {
	let parsed: ReturnType<typeof parseConfiguredValue>;
	const recipeIds = (options.grammar.recipes?.recipes ?? []).map(
		(recipe) => recipe.id,
	);
	try {
		parsed = parseConfiguredValue(
			options.sample.input,
			options.grammar,
			{ enabledRecipes: recipeIds },
			{
				terminals: options.terminals as never,
				outputBuilders: options.outputBuilders as never,
				...(options.request ? { valueRequest: options.request } : {}),
			},
		);
	} catch {
		return {
			input: options.sample.input,
			argumentId: options.sample.argumentId,
			matched: false,
			diagnostics: [
				{
					severity: "error",
					code: "SAMPLE_EVALUATION_FAILED",
					messageKey: "settings.values.parseError",
				},
			],
		};
	}
	const diagnostics = parsed.diagnostics.map((diagnostic) => ({
		severity: "error" as const,
		code: diagnostic.errorCode,
		messageKey: diagnostic.messageKey ?? "settings.values.parseError",
		messageParams: diagnostic.messageParams as never,
	}));
	const selected = parsed.selected;
	if (!selected) {
		return {
			input: options.sample.input,
			argumentId: options.sample.argumentId,
			matched: false,
			rejected: [{ recipeId: "*", reason: "capability_mismatch" }],
			diagnostics,
		};
	}
	const canonical = jsonSafe(selected.canonicalValue);
	return {
		input: options.sample.input,
		argumentId: options.sample.argumentId,
		matched: true,
		recipeId: selected.recipeId,
		...(canonical !== undefined ? { canonicalValue: canonical as never } : {}),
		displayValue: selected.displayValue,
		captures: Object.fromEntries(
			Object.entries(selected.captures).filter(
				(entry): entry is [string, string] => typeof entry[1] === "string",
			),
		),
		diagnostics,
	};
}
