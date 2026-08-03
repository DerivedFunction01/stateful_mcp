import { describe, expect, it } from "bun:test";
import { createEventStore, EventStore } from "@stateful-mcp/core";
import { MemoryKvBackend as SimpleMemoryKvBackend } from "@stateful-mcp/core/adapters/storage/simple/memory/backend";
import { ClinicalOperationCompiler } from "../src/clinical/clinical-operation-compiler";
import { ClinicalSchemaAdapterRegistry } from "../src/clinical/clinical-schema-adapter";
import { CoreClinicalEventStore } from "../src/clinical/core-clinical-event-store";
import { CoreStreamEventStore } from "../src/events/core-stream-event-store";
import type {
	StreamEventCodec,
	StreamEventRecord,
} from "../src/events/stream-event-store";

async function eventStore(): Promise<EventStore> {
	const storage = await createEventStore(new SimpleMemoryKvBackend());
	return new EventStore({
		session: storage,
		persistent: storage,
		schemas: new Map(),
	});
}

describe(" clinical operations", () => {
	it("compiles schema records without schema-specific event union variants", async () => {
		const schemas = new ClinicalSchemaAdapterRegistry();
		schemas.register({
			schemaName: "FutureObservation",
			schemaVersion: 1,
			validateRecord: () => ({ valid: true, diagnostics: [] }),
		});
		const compiler = new ClinicalOperationCompiler(schemas);
		const event = compiler.compile({
			kind: "record_upserted",
			documentId: "doc-1",
			schemaName: "FutureObservation",
			schemaVersion: 1,
			recordId: "obs-1",
			values: { value: 42 },
		});

		expect(event.kind).toBe("clinical_record_upserted");
		expect(event.schemaName).toBe("FutureObservation");
		expect(event.values).toEqual({ value: 42 });
	});

	it("uses the generic core stream adapter for a future event type", async () => {
		type FutureEvent = {
			kind: "future_record";
			streamId: string;
			value: number;
		};
		type FutureRecord = StreamEventRecord<FutureEvent>;
		const codec: StreamEventCodec<FutureEvent, FutureRecord> = {
			schemaName: "v2_future_events",
			encode: (event) => event,
			decode: (record, context) => ({
				eventId: String(record.event_id),
				streamId: context.streamId,
				commitId: context.commitId,
				parentCommitId: context.parentCommitId,
				payload: record as FutureEvent,
			}),
		};
		const store = new CoreStreamEventStore<FutureEvent, FutureRecord>(
			await eventStore(),
			codec,
		);
		const initialized = await store.initialize("future-1", "session-1", {
			kind: "future_record",
			streamId: "future-1",
			value: 1,
		});
		const appended = await store.append({
			streamId: "future-1",
			sessionId: "session-1",
			parentCommitId: initialized.commitId,
			events: [{ kind: "future_record", streamId: "future-1", value: 2 }],
		});
		const projected = await store.project(
			"future-1",
			"session-1",
			appended.commitId,
		);

		expect(projected.map((record) => record.payload.value)).toEqual([1, 2]);
		expect(appended.commitId).not.toBe(initialized.commitId);
	});

	it("uses the generic adapter for clinical events", async () => {
		const store = new CoreClinicalEventStore(await eventStore());
		const initialized = await store.initialize("doc-1", "session-1", {
			kind: "clinical_document_initialized",
			documentId: "doc-1",
			sessionId: "session-1",
			patientId: "patient-1",
		});
		const appended = await store.append({
			streamId: "doc-1",
			sessionId: "session-1",
			parentCommitId: initialized.commitId,
			events: [
				{
					kind: "clinical_record_upserted",
					documentId: "doc-1",
					schemaName: "FutureObservation",
					schemaVersion: 1,
					recordId: "obs-1",
					values: { value: 42 },
				},
			],
		});
		const projected = await store.project(
			"doc-1",
			"session-1",
			appended.commitId,
		);

		expect(projected).toHaveLength(2);
		expect(projected[1]?.payload.kind).toBe("clinical_record_upserted");
	});

	it("compiles macro targets: upsert on missing record, patch on existing", () => {
		const schemas = new ClinicalSchemaAdapterRegistry();
		schemas.register({
			schemaName: "Note",
			schemaVersion: 1,
			validateRecord: () => ({ valid: true, diagnostics: [] }),
		});
		const compiler = new ClinicalOperationCompiler(schemas);
		const ops = [
			{
				operationId: "r1",
				targetSchema: "Note",
				targetPath: "value",
				value: 10,
				rawValue: "10",
				sourceLine: 1,
				groupId: "g",
				evidence: [],
			},
			{
				operationId: "r2",
				targetSchema: "Note",
				targetPath: "value",
				value: 20,
				rawValue: "20",
				sourceLine: 2,
				groupId: "g",
				evidence: [],
			},
		];

		const fresh = compiler.compileMacroTargets("doc-1", ops, {});
		expect(fresh[0]!.kind).toBe("record_upserted");
		expect(fresh[1]!.kind).toBe("record_upserted");

		const existing = compiler.compileMacroTargets("doc-1", ops, {
			existing: { r1: { values: { value: 5 } } },
		});
		expect(existing[0]!.kind).toBe("record_patched");
		expect(existing[0]!.changes).toEqual({ value: 10 });
		expect(existing[1]!.kind).toBe("record_upserted");
	});

	it("compiles macro targets: groups ops by record id and merges via write policy", () => {
		const schemas = new ClinicalSchemaAdapterRegistry();
		schemas.register({
			schemaName: "Note",
			schemaVersion: 1,
			validateRecord: () => ({ valid: true, diagnostics: [] }),
		});
		const compiler = new ClinicalOperationCompiler(schemas);
		const ops = [
			{
				operationId: "r1",
				targetSchema: "Note",
				targetPath: "a",
				value: 1,
				rawValue: "1",
				sourceLine: 1,
				groupId: "g",
				evidence: [],
			},
			{
				operationId: "r1",
				targetSchema: "Note",
				targetPath: "b",
				value: 2,
				rawValue: "2",
				sourceLine: 2,
				groupId: "g",
				evidence: [],
			},
		];

		const fresh = compiler.compileMacroTargets("doc-1", ops, {
			writePolicy: "upsert",
		});
		expect(fresh).toHaveLength(1);
		expect(fresh[0]!.kind).toBe("record_upserted");
		expect((fresh[0] as { values: Record<string, unknown> }).values).toEqual({
			a: 1,
			b: 2,
		});

		const existing = compiler.compileMacroTargets("doc-1", ops, {
			writePolicy: "upsert",
			existing: { r1: { values: { a: 0 } } },
		});
		expect(existing[0]!.kind).toBe("record_patched");
		expect(
			(existing[0] as { changes: Record<string, unknown> }).changes,
		).toEqual({ a: 1, b: 2 });
	});
});
