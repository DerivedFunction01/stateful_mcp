import type {
	RegisteredSchema,
	SchemaDefinition,
	SchemaField,
	SchemaFingerprint,
} from "./schema-types";

export interface SchemaRegistryOptions {
	allowDraftResolution?: boolean;
}

export class SchemaRegistry {
	private readonly schemas = new Map<string, Map<number, RegisteredSchema>>();
	private readonly allowDraftResolution: boolean;

	constructor(options: SchemaRegistryOptions = {}) {
		this.allowDraftResolution = options.allowDraftResolution ?? false;
	}

	register(definition: SchemaDefinition): RegisteredSchema {
		validateDefinition(definition);
		const registered: RegisteredSchema = {
			...definition,
			fields: cloneFields(definition.fields),
			fingerprint: fingerprintSchema(definition),
		};
		const versions = this.schemas.get(definition.schema) ?? new Map();
		if (versions.has(definition.version)) {
			throw new Error(
				`Schema '${definition.schema}' version ${definition.version} is already registered`,
			);
		}
		versions.set(definition.version, registered);
		this.schemas.set(definition.schema, versions);
		return registered;
	}

	get(schema: string, version?: number): RegisteredSchema | null {
		const versions = this.schemas.get(schema);
		if (!versions) return null;
		if (version !== undefined) return versions.get(version) ?? null;
		const candidates = [...versions.values()].filter((item) =>
			this.allowDraftResolution ? item.status !== "retired" : item.status === "published",
		);
		return candidates.sort((left, right) => right.version - left.version)[0] ?? null;
	}

	list(schema?: string): RegisteredSchema[] {
		if (schema) return [...(this.schemas.get(schema)?.values() ?? [])];
		return [...this.schemas.values()].flatMap((versions) => [...versions.values()]);
	}

	getField(schema: string, path: string, version?: number): SchemaField | null {
		return this.get(schema, version)?.fields[path] ?? null;
	}
}

function validateDefinition(definition: SchemaDefinition): void {
	if (!definition.schema.trim()) throw new Error("Schema name is required");
	if (!Number.isInteger(definition.version) || definition.version < 1) {
		throw new Error("Schema version must be a positive integer");
	}
	if (Object.keys(definition.fields).length === 0) {
		throw new Error(`Schema '${definition.schema}' must define at least one field`);
	}
	for (const [key, field] of Object.entries(definition.fields)) {
		if (!field.path.trim() || key !== field.path) {
			throw new Error(`Schema field key '${key}' does not match its path`);
		}
		if (field.valueKind === "scalar" && !field.scalarType) {
			throw new Error(`Scalar field '${field.path}' must declare scalarType`);
		}
		if (field.valueKind === "enum" && (!field.enumValues || field.enumValues.length === 0)) {
			throw new Error(`Enum field '${field.path}' must declare enumValues`);
		}
		if (field.valueKind === "measurement" && !field.measurement) {
			throw new Error(`Measurement field '${field.path}' must declare measurement metadata`);
		}
		if (field.measurement?.allowedUnits) {
			assertUnique(field.measurement.allowedUnits, `allowed units for '${field.path}'`);
		}
		if (field.measurement?.statisticalTypes) {
			assertUnique(field.measurement.statisticalTypes, `statistical types for '${field.path}'`);
		}
		if (field.measurement?.operators) {
			assertUnique(field.measurement.operators, `operators for '${field.path}'`);
		}
		if (field.valueKind === "temporal" && !field.temporalType) {
			throw new Error(`Temporal field '${field.path}' must declare temporalType`);
		}
	}
}

function assertUnique(values: readonly string[], label: string): void {
	if (new Set(values).size !== values.length) {
		throw new Error(`Duplicate values found in ${label}`);
	}
}

function cloneFields(fields: Readonly<Record<string, SchemaField>>): Record<string, SchemaField> {
	return Object.fromEntries(
		Object.entries(fields).map(([path, field]) => [path, {
			...field,
			enumValues: field.enumValues ? [...field.enumValues] : undefined,
			measurement: field.measurement
				? {
					...field.measurement,
					allowedUnits: field.measurement.allowedUnits
						? [...field.measurement.allowedUnits]
						: undefined,
				}
				: undefined,
			conceptResolution: field.conceptResolution
				? {
					...field.conceptResolution,
					allowedNamespaces: field.conceptResolution.allowedNamespaces
						? [...field.conceptResolution.allowedNamespaces]
						: undefined,
				}
				: undefined,
		}]),
	) as Record<string, SchemaField>;
}

export function fingerprintSchema(definition: SchemaDefinition): SchemaFingerprint {
	return {
		value: hashString(stableSerialize(definition)),
		algorithm: "v2-schema-fingerprint-v1",
	};
}

function stableSerialize(value: unknown): string {
	if (value === null || typeof value !== "object") {
		return JSON.stringify(value) ?? "undefined";
	}
	if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
	const record = value as Record<string, unknown>;
	return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`).join(",")}}`;
}

function hashString(value: string): string {
	let hash = 2166136261;
	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0).toString(16).padStart(8, "0");
}
