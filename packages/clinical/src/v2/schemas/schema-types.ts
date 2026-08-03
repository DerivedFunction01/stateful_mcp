import type {
	ScalarType,
	TemporalValueType,
	TypedValue,
	TypedValueKind,
} from "../values/typed-value";

export type SchemaPublicationStatus = "draft" | "published" | "retired";

export type SchemaCardinality = "one" | "many";

export interface SchemaNumericBounds {
	min?: number;
	max?: number;
	inclusiveMin?: boolean;
	inclusiveMax?: boolean;
}

export interface SchemaConceptResolution {
	required: boolean;
	allowedNamespaces?: readonly string[];
}

export interface SchemaMeasurementMetadata {
	dimension: string;
	allowedUnits?: readonly string[];
	canonicalUnit?: string;
}

export interface SchemaField {
	path: string;
	valueKind: TypedValueKind;
	cardinality: SchemaCardinality;
	required: boolean;
	scalarType?: ScalarType;
	enumValues?: readonly string[];
	measurement?: SchemaMeasurementMetadata;
	temporalType?: TemporalValueType;
	itemKind?: TypedValueKind;
	bounds?: SchemaNumericBounds;
	conceptResolution?: SchemaConceptResolution;
	defaultValue?: TypedValue;
}

export interface SchemaFingerprint {
	value: string;
	algorithm: "v2-schema-fingerprint-v1";
}

export interface SchemaDefinition {
	schema: string;
	version: number;
	status: SchemaPublicationStatus;
	fields: Readonly<Record<string, SchemaField>>;
	description?: string;
	publishedAt?: string;
	metadata?: Readonly<Record<string, string>>;
}

export interface RegisteredSchema extends SchemaDefinition {
	fingerprint: SchemaFingerprint;
}
