import type { ClinicalDocumentRecord } from "../clinical/clinical-document-types";
import type { V2PresentationField, V2PresentationItem } from "./field-types";
import type { V2PresentationFieldSpec, V2PresentationPolicy } from "./policies";
import {
	formatV2Quantity,
	type V2QuantityFormatContext,
} from "./quantity-format";

export function createV2RecordPresentation(
	record: ClinicalDocumentRecord,
	policy?: V2PresentationPolicy,
	context?: V2QuantityFormatContext,
): V2PresentationItem {
	const values = record.values;
	const paths = Object.keys(values).filter(
		(path) => !policy?.hiddenPaths?.includes(path),
	);
	const groups = policy?.groups?.length
		? policy.groups.map((group) => ({
				id: group.id,
				label: group.label,
				fields: group.paths
					.filter((path) => path in values)
					.map((path) =>
						projectField(
							path,
							values[path],
							policy.fields[path],
							policy,
							context,
						),
					),
			}))
		: [
				{
					id: "fields",
					label: "Fields",
					fields: paths.map((path) =>
						projectField(
							path,
							values[path],
							policy?.fields[path],
							policy,
							context,
						),
					),
				},
			];
	const concepts = Object.values(values).filter(isConcept);
	const titleValue = policy?.titlePath
		? resolve(values, policy.titlePath)
		: concepts[0];
	return {
		recordId: record.recordId,
		targetSchema: record.schemaName,
		title:
			typeof titleValue === "string"
				? titleValue
				: isConcept(titleValue)
					? titleValue.display
					: record.schemaName,
		values,
		concepts,
		groups,
	};
}

function projectField(
	path: string,
	value: unknown,
	spec: V2PresentationFieldSpec | undefined,
	policy: V2PresentationPolicy | undefined,
	context?: V2QuantityFormatContext,
): V2PresentationField {
	const field: V2PresentationField = {
		path,
		label: spec?.label ?? label(path),
		kind: spec?.kind ?? inferKind(value),
		value,
		state:
			value === null ||
			value === undefined ||
			value === "" ||
			(Array.isArray(value) && value.length === 0)
				? "unresolved"
				: "resolved",
		emphasis: spec?.emphasis,
		formatted: ["measurement", "quantity", "duration", "range"].includes(
			spec?.kind ?? "",
		)
			? formatV2Quantity(value, { ...context, targetField: path })
			: undefined,
	};
	if (Array.isArray(value))
		field.children = value.map((entry, index) =>
			projectField(`${path}[${index}]`, entry, spec?.item, policy, context),
		);
	else if (isObject(value))
		field.children = Object.entries(value).map(([key, entry]) =>
			projectField(
				`${path}.${key}`,
				entry,
				spec?.fields?.[key] ?? policy?.fields[key],
				policy,
				context,
			),
		);
	return field;
}

function resolve(record: Record<string, unknown>, path: string): unknown {
	return path
		.split(".")
		.reduce<unknown>(
			(current, key) => (isObject(current) ? current[key] : undefined),
			record,
		);
}
function isObject(value: unknown): value is Record<string, unknown> {
	return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
function isConcept(value: unknown): value is { display: string } {
	return isObject(value) && typeof value.display === "string";
}
function label(path: string): string {
	return (path.split(".").pop() ?? path)
		.replace(/([a-z])([A-Z])/g, "$1 $2")
		.replace(/[_-]/g, " ")
		.replace(/^./, (char) => char.toUpperCase());
}
function inferKind(value: unknown): V2PresentationField["kind"] {
	if (isConcept(value)) return "concept";
	if (Array.isArray(value)) return "collection";
	if (typeof value === "boolean") return "boolean";
	if (typeof value === "number") return "number";
	if (typeof value === "string") return "text";
	if (isObject(value) && "magnitude" in value) return "measurement";
	if (isObject(value)) return "object";
	return "text";
}
