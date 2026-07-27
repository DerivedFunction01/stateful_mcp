import { resolveSchemaDefault } from "../store/default-strategy";
import type { FieldMappingRule, NamedGroupContract } from "../store/interfaces";

export interface DefaultResolutionContext {
	rawText?: string;
	parsedPartial?: Record<string, any>;
	profile?: {
		schemaDefaults?: Record<string, Record<string, any>>;
		defaultsStrategy?: string;
	};
}

export class FieldResolverEngine {
	static transform<
		TSchema extends string,
		TRegistry extends FieldMappingRule<TSchema>[],
	>(
		registry: TRegistry,
		token: Record<string, any>,
		conceptDefaults: Record<string, any> | null,
		targetSchema: string,
		profile: DefaultResolutionContext["profile"],
	): Record<string, any> {
		const extractedData: Record<string, any> = {};

		for (const rule of registry) {
			const targetField = rule.targetField ?? rule.sourceKey;
			const rawGroups = token.namedGroups?.[rule.sourceKey];
			const slots = token;

			let value: unknown;

			if (rule.compute) {
				value = rule.compute(slots, conceptDefaults, rawGroups);
			} else if (rawGroups !== undefined) {
				value = rawGroups;
			} else if (slots[rule.sourceKey] !== undefined) {
				value = slots[rule.sourceKey];
				if (rule.valueMap && rule.valueMap[value as string] !== undefined) {
					value = rule.valueMap[value as string];
				}
			}

			if (value === undefined || value === null) {
				if (rule.conceptDefaultPath && conceptDefaults) {
					value = FieldResolverEngine.resolvePath(
						conceptDefaults,
						rule.conceptDefaultPath,
					);
				}
			}
			if (value === undefined || value === null) {
				if (rule.schemaDefaultField) {
					value = resolveSchemaDefault(
						targetSchema,
						rule.schemaDefaultField,
						profile,
						{ rawText: token.anchorText, parsedPartial: slots },
					);
				}
			}

			if (value !== undefined && value !== null) {
				extractedData[targetField] = value;
			}
		}

		return extractedData;
	}

	private static resolvePath(
		obj: Record<string, any>,
		path: (string | number)[],
	): unknown {
		let current: any = obj;
		for (const key of path) {
			if (current === undefined || current === null) return undefined;
			current = current[key];
		}
		return current;
	}
}
