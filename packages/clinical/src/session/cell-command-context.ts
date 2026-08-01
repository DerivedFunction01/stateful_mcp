import { schemaParserRegistry } from "../parser/schema-parsers";
import type { ParserSyntaxProfile } from "../store/interfaces";
import type { Cell } from "./cell";

export interface ResolvedFieldTarget {
	targetSchema: string;
	fieldPath: string;
	value: string;
}

function splitSchemaPath(
	path: string,
): { schema: string; fieldPath: string } | null {
	const separator = path.indexOf(".");
	if (separator <= 0 || separator === path.length - 1) return null;
	return {
		schema: path.slice(0, separator),
		fieldPath: path.slice(separator + 1),
	};
}

export function resolveFieldTarget(
	fieldArg: string,
	valueArg: string,
	cell: Cell,
	profile: ParserSyntaxProfile,
): ResolvedFieldTarget | null {
	const mapped = profile.fieldMappings?.[fieldArg] ?? fieldArg;
	const explicit = splitSchemaPath(mapped);
	const knownSchema =
		explicit &&
		Array.from(schemaParserRegistry.values()).some(
			(parser) =>
				parser.targetSchema.toLowerCase() === explicit.schema.toLowerCase(),
		);
	if (explicit && knownSchema)
		return {
			targetSchema: explicit.schema,
			fieldPath: explicit.fieldPath,
			value: valueArg,
		};

	const targetSchema =
		cell.routing.targetSchema ??
		(cell.metadata?.parentTargetSchema as string | undefined) ??
		Object.keys(cell.context.objects)[0];
	if (!targetSchema) return null;
	return { targetSchema, fieldPath: mapped, value: valueArg };
}

export function setNestedField(
	data: Record<string, any>,
	path: string,
	value: unknown,
): void {
	const parts = path.split(".").filter(Boolean);
	if (!parts.length) return;
	let current = data;
	for (const part of parts.slice(0, -1)) {
		if (
			!current[part] ||
			typeof current[part] !== "object" ||
			Array.isArray(current[part])
		) {
			current[part] = {};
		}
		current = current[part];
	}
	current[parts[parts.length - 1]!] = value;
}
