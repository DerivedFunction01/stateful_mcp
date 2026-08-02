import type { ParsedItem } from "../parser/schema-parsers";
import type { CodeableConcept } from "../schemas/shared";
import type {
	PresentationField,
	PresentationFieldKind,
	PresentationGroup,
	PresentationItem,
} from "./field-types";
import { getPresentationPolicy, type PresentationSchema } from "./policies";
import { formatQuantity, type QuantityFormatContext } from "./quantity-format";

function object(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
function concept(value: unknown): boolean {
	return (
		object(value) &&
		typeof value.display === "string" &&
		(value.conceptId === undefined || typeof value.conceptId === "string")
	);
}
function measurement(value: unknown): boolean {
	return (
		object(value) && typeof value.magnitude === "number" && "unit" in value
	);
}
function kind(value: unknown): PresentationFieldKind {
	if (concept(value)) return "concept";
	if (object(value) && ("low" in value || "high" in value)) return "range";
	if (object(value) && "anatomy" in value) return "anatomy";
	if (Array.isArray(value)) return "collection";
	if (typeof value === "boolean") return "boolean";
	if (typeof value === "number") return "number";
	if (measurement(value))
		return object((value as Record<string, unknown>).unit)
			? "measurement"
			: "duration";
	if (typeof value === "string") return "text";
	if (object(value)) return "object";
	return "text";
}
function state(value: unknown): "resolved" | "unresolved" {
	return value === null ||
		value === undefined ||
		value === "" ||
		(Array.isArray(value) && value.length === 0)
		? "unresolved"
		: "resolved";
}
function label(path: string): string {
	return (path.split(".").pop() ?? path)
		.replace(/([a-z])([A-Z])/g, "$1 $2")
		.replace(/[_-]/g, " ")
		.replace(/^./, (c) => c.toUpperCase());
}
function title(
	record: Record<string, unknown>,
	path?: string,
): string | undefined {
	if (!path) return undefined;
	const value = path
		.split(".")
		.reduce<unknown>(
			(current, key) => (object(current) ? current[key] : undefined),
			record,
		);
	return typeof value === "string"
		? value
		: concept(value)
			? (value as CodeableConcept).display
			: undefined;
}
function field(
	path: string,
	value: unknown,
	spec: PresentationSchema["fields"][string] | undefined,
	policy: PresentationSchema | undefined,
	ancestors: Set<object>,
	context?: QuantityFormatContext,
): PresentationField {
	const fieldKind = spec?.kind ?? kind(value);
	const result: PresentationField = {
		path,
		label: spec?.label ?? label(path),
		kind: fieldKind,
		value,
		state: state(value),
		emphasis: spec?.emphasis,
		formatted:
			context &&
			["measurement", "quantity", "duration", "range"].includes(fieldKind)
				? formatQuantity(value, { ...context, targetField: path })
				: undefined,
	};
	if (Array.isArray(value))
		result.children = value.map((entry, index) =>
			field(`${path}[${index}]`, entry, spec?.item, policy, ancestors, context),
		);
	else if (object(value) && !ancestors.has(value)) {
		const next = new Set(ancestors);
		next.add(value);
		result.children = Object.entries(value).map(([key, entry]) =>
			field(
				path ? `${path}.${key}` : key,
				entry,
				spec?.fields?.[key] ?? policy?.fields[key],
				policy,
				next,
				context,
			),
		);
	}
	return result;
}
function fields(
	record: Record<string, unknown>,
	paths: string[],
	policy: PresentationSchema | undefined,
	context?: QuantityFormatContext,
): PresentationField[] {
	const hidden = new Set(policy?.hiddenPaths ?? []);
	return paths
		.filter(
			(path) => !hidden.has(path) && policy?.fields[path]?.visible !== false,
		)
		.map((path) =>
			field(
				path,
				record[path],
				policy?.fields[path],
				policy,
				new Set(),
				context,
			),
		);
}
export function createParsedItemPresentation(
	item: ParsedItem,
	context?: QuantityFormatContext,
): PresentationItem {
	const record = (item.extractedData ?? {}) as Record<string, unknown>;
	const policy = getPresentationPolicy(item.targetSchema);
	const paths = Object.keys(record).filter(
		(path) => !policy?.hiddenPaths?.includes(path),
	);
	const groups: PresentationGroup[] = policy?.groups?.length
		? policy.groups.map((group) => ({
				id: group.id,
				label: group.label,
				fields: fields(record, group.paths, policy, context),
			}))
		: [
				{
					id: "fields",
					label: "Fields",
					fields: fields(record, paths, policy, context),
				},
			];
	return {
		targetSchema: item.targetSchema,
		title:
			title(record, policy?.titlePath) ??
			item.concept[0]?.display ??
			item.targetSchema,
		rawText: item.rawText,
		concepts: item.concept ?? [],
		groups,
	};
}
