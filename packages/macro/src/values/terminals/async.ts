import type { AsyncTerminalParser } from "../recipes";
import { createBuiltinTerminals } from "./sync";
import type { BuiltinTerminalOptions } from "./types";

/**
 * Async terminal set for authored templates containing resolver-backed
 * concepts. A concept is accepted only after the configured resolver returns
 * a canonical resolution.
 */
export function createAsyncBuiltinTerminals(
	options: BuiltinTerminalOptions,
): Readonly<Record<string, AsyncTerminalParser>> {
	const syncTerminals = createBuiltinTerminals(options);
	const asyncTerminals: Record<string, AsyncTerminalParser> = {
		...syncTerminals,
		concept: async (_id, input, request) => {
			const config = (request?.grammar ?? options.grammar).quantity;
			const resolver = config.conceptResolver;
			if (!resolver) return { valid: false, stable: true };
			try {
				const resolution = await resolver(input.trim(), {
					locales: config.locales,
					packagingUnit:
						(request?.context?.packagingUnit as string | undefined) ??
						undefined,
				});
				if (!resolution?.conceptId) return { valid: false, stable: true };
				return {
					valid: true,
					value: resolution,
					canonicalValue: {
						conceptId: resolution.conceptId,
						term: resolution.canonicalTerm ?? input.trim(),
						rawText: input.trim(),
						...(resolution.standardCode
							? { standardCode: resolution.standardCode }
							: {}),
						...(resolution.metadata ? { metadata: resolution.metadata } : {}),
					},
					stable: true,
				};
			} catch {
				return { valid: false, stable: true };
			}
		},
	};
	return asyncTerminals;
}
