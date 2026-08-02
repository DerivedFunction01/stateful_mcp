import type { OwnerScope, ResourceLocator } from "../config/types";

export interface StoreCapabilities {
	read?: boolean;
	write?: boolean;
	delete?: boolean;
	search?: boolean;
	batchRead?: boolean;
	batchWrite?: boolean;
	snapshots?: boolean;
	incrementalChanges?: boolean;
	tombstones?: boolean;
	checkpoints?: boolean;
	transactions?: boolean;
	conditionalWrites?: boolean;
	conflictDetection?: boolean;
	aliases?: boolean;
	children?: boolean;
	ttl?: boolean;
	tags?: boolean;
	appendOnly?: boolean;
	merge?: boolean;
}
export interface StorePermissions {
	read?: boolean;
	write?: boolean;
	delete?: boolean;
	syncRead?: boolean;
	syncWrite?: boolean;
	export?: boolean;
	import?: boolean;
}
export type StorageRole =
	| "source"
	| "projection"
	| "cache"
	| "fallback"
	| "backup";
export type StorageAuthority = "authoritative" | "derived" | "user" | "backup";
export interface SyncBinding {
	sourceId?: string;
	domain?: string;
	enabled?: boolean;
}
export interface StoreBinding {
	id?: string;
	locator: ResourceLocator;
	role: StorageRole;
	authority?: StorageAuthority;
	capabilities?: StoreCapabilities;
	permissions?: StorePermissions;
	freshnessTtlMs?: number;
	sync?: SyncBinding;
}
export interface StoreRoute {
	source?: StoreBinding;
	projection?: StoreBinding;
	cache?: StoreBinding;
	fallback?: StoreBinding[];
	backup?: StoreBinding[];
}
export interface ScopedStoreRoute {
	global?: StoreRoute;
	user?: StoreRoute;
}
export interface SessionStoreRoute {
	route?: StoreRoute;
	sync?: SyncBinding;
	ttlMs?: number;
	syncEnabled?: boolean;
}
export interface PersistentStoreRoute {
	scope?: ScopedStoreRoute;
	sync?: SyncBinding;
	syncEnabled?: boolean;
}
export interface SyncRecord {
	sourceId: string;
	domain: string;
	recordId: string;
	operation: "upsert" | "delete";
	revision: string;
	occurredAt: string;
	scope?: OwnerScope;
	payload?: unknown;
	tombstone?: boolean;
}
export interface SyncMedium {
	read(): AsyncIterable<SyncRecord>;
	write(records: AsyncIterable<SyncRecord>): Promise<void>;
}
export interface SyncSource {
	snapshot(request?: unknown): AsyncIterable<SyncRecord>;
	changes(cursor?: string, limit?: number): AsyncIterable<SyncRecord>;
	capabilities(): StoreCapabilities;
}
export interface SyncPreview {
	accepted: number;
	rejected: number;
	conflicts?: number;
}
export interface SyncResult extends SyncPreview {
	cursor?: string;
}
export interface SyncTarget {
	preview(records: AsyncIterable<SyncRecord>): Promise<SyncPreview>;
	apply(records: AsyncIterable<SyncRecord>): Promise<SyncResult>;
}

export interface SyncCheckpointRecord {
	projectionId: string;
	sourceId: string;
	domain: string;
	cursor?: string;
	status: "idle" | "applied" | "error";
	updatedAt: string;
	errorMessage?: string;
}

export interface SyncCheckpointStore {
	get(
		projectionId: string,
		sourceId: string,
		domain: string,
	): Promise<SyncCheckpointRecord | null>;
	set(checkpoint: SyncCheckpointRecord): Promise<void>;
}

export interface CursorSyncSource extends SyncSource {
	changesPage(
		cursor?: string,
		limit?: number,
	): Promise<{ records: SyncRecord[]; nextCursor?: string; hasMore?: boolean }>;
}
