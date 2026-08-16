import type {
	MacroChildBinding,
	MacroChildHandler,
	MacroDefinitionAdapter,
} from "../contracts/composition";
import type { MacroInput } from "../contracts/input";
import type { MacroArgumentSpec, MacroSpec } from "../contracts/macro";
import type { MacroAuthoringTemplate } from "../contracts/matching";

export interface MacroDerivationOptions {
	/** The new unique macro name (e.g. "ro", "dx", "quick-incident") */
	readonly macroName: string;

	/** Optional revised description */
	readonly description?: string;

	/** Override or simplified argument specifications */
	readonly arguments?: readonly MacroArgumentSpec[];

	/** Override authoring templates */
	readonly authoringTemplates?: readonly MacroAuthoringTemplate[];

	/** Override authoring preview template */
	readonly previewTemplate?: MacroAuthoringTemplate;

	/**
	 * Argument & Binding Mapper:
	 * Maps the derived macro's simplified slots into the base macro's argument shape.
	 * If omitted, bindings are forwarded directly to the base compile() handler.
	 */
	readonly mapBindings?: (
		derivedBindings: readonly MacroChildBinding[],
		derivedInput: MacroInput,
	) => {
		readonly baseBindings: readonly MacroChildBinding[];
		readonly baseInput: MacroInput;
	};

	/** Specific child validator / handler overrides */
	readonly overrideChildren?: Readonly<
		Record<string, Partial<MacroChildHandler>>
	>;
}

/**
 * Derives a specialized or shorthand macro from a base MacroDefinitionAdapter,
 * allowing syntax and slot simplification while preserving internal validation and output schemas.
 */
export function deriveMacroAdapter(
	base: MacroDefinitionAdapter,
	options: MacroDerivationOptions,
): MacroDefinitionAdapter {
	const derivedSpec: MacroSpec = {
		...base.definition,
		id: options.macroName,
		name: options.macroName,
		arguments: options.arguments
			? [...options.arguments]
			: base.definition.arguments,
		...(options.authoringTemplates
			? { authoringTemplates: options.authoringTemplates }
			: base.definition.authoringTemplates
				? { authoringTemplates: base.definition.authoringTemplates }
				: {}),
	};

	const mergedChildren: Record<string, MacroChildHandler> = {
		...base.children,
	};
	if (options.overrideChildren) {
		for (const [key, handlerOverride] of Object.entries(
			options.overrideChildren,
		)) {
			if (mergedChildren[key]) {
				mergedChildren[key] = {
					...mergedChildren[key],
					...handlerOverride,
				} as MacroChildHandler;
			} else if (handlerOverride.type && handlerOverride.validate) {
				mergedChildren[key] = handlerOverride as MacroChildHandler;
			}
		}
	}

	return {
		definition: derivedSpec,
		previewTemplate: options.previewTemplate ?? base.previewTemplate,
		children: mergedChildren,
		compile: async (bindings, input, childResults) => {
			if (options.mapBindings) {
				const mapped = options.mapBindings(bindings, input);
				return base.compile
					? base.compile(mapped.baseBindings, mapped.baseInput, childResults)
					: undefined;
			}
			return base.compile
				? base.compile(bindings, input, childResults)
				: undefined;
		},
	};
}
