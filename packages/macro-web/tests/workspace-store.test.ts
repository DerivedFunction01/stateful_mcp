import { describe, expect, test } from "bun:test";
import type { HostEvent } from "@stateful-mcp/macro-protocol";
import { createDiagnosticHostClient } from "../src/dev/diagnostic-host-client";
import type { HostClient } from "../src/lib/host-client";
import { BrowserWorkspaceStore } from "../src/lib/workspace-store";

function testClient() {
	const base = createDiagnosticHostClient();
	const listeners = new Set<(event: HostEvent) => void>();
	const client: HostClient = {
		...base,
		subscribe(listener) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
	};
	return {
		client,
		emit: (event: HostEvent) =>
			listeners.forEach((listener) => listener(event)),
	};
}

describe("BrowserWorkspaceStore", () => {
	test("does not refresh the file tree for a memory-only session", async () => {
		const { client: baseClient } = testClient();
		let refreshCount = 0;
		const client: HostClient = {
			...baseClient,
			getFileTree: async () => {
				refreshCount += 1;
				return [];
			},
		};
		const store = new BrowserWorkspaceStore(client);

		await store.start();
		await store.refreshFileTree();

		expect(refreshCount).toBe(0);
	});

	test("installs a snapshot and rejects duplicate or stale events", async () => {
		const { client, emit } = testClient();
		const store = new BrowserWorkspaceStore(client);
		await store.start();
		const initial = store.getSnapshot().snapshot!;
		const newer = { ...initial, revision: 1 };
		const event: HostEvent = {
			version: 1,
			type: "workspace.changed",
			sessionId: initial.sessionId,
			eventId: "event-1",
			sequence: 1,
			revision: 1,
			payload: { snapshot: newer },
		};
		emit(event);
		expect(store.getSnapshot().snapshot?.revision).toBe(1);
		emit({ ...event, eventId: "event-duplicate" });
		expect(store.getSnapshot().lastSequence).toBe(1);
		emit({
			...event,
			eventId: "event-stale",
			sequence: 2,
			revision: 0,
			payload: { snapshot: initial },
		});
		expect(store.getSnapshot().snapshot?.revision).toBe(1);
	});
});
