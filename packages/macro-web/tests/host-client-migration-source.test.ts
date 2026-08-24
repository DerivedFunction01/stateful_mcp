import { afterEach, describe, expect, test } from "bun:test";
import { BrowserHostClient } from "../src/lib/host-client";

const originalFetch = global.fetch;

afterEach(() => {
	global.fetch = originalFetch;
});

describe("host client migration source typing", () => {
	test("previewBackendMigration sends the current backend descriptor as source", async () => {
		const requests: { url: string; body: unknown }[] = [];
		const backend = { kind: "jsonl" as const, path: ".macro/state.jsonl" };
		const configuration = {
			backend,
			projectId: "p1",
			displayName: "Project",
		};
		global.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
			const body = init?.body ? JSON.parse(init.body as string) : undefined;
			requests.push({ url: String(url), body });
			if (body?.type === "project.getConfiguration") {
				return new Response(
					JSON.stringify({ ok: true, payload: configuration }),
					{ status: 200 },
				);
			}
			if (body?.type === "project.previewBackendMigration") {
				return new Response(
					JSON.stringify({
						ok: true,
						payload: {
							status: "plan",
							configuration,
							plan: {
								source: backend,
								target: { kind: "sqlite", path: ".macro/s.db" },
								participants: [],
								historyCount: 0,
								scratchpadCount: 0,
								warnings: [],
								sourceDigest: "",
							},
						},
					}),
					{ status: 200 },
				);
			}
			return new Response(JSON.stringify({ ok: true, payload: {} }), {
				status: 200,
			});
		}) as typeof fetch;

		const client = new BrowserHostClient("http://test");
		(client as unknown as { sessionId: string }).sessionId = "s1";

		const target = { kind: "sqlite" as const, path: ".macro/s.db" };
		await client.previewBackendMigration(target);

		const preview = requests.find(
			(r) =>
				(r.body as { type?: string })?.type ===
				"project.previewBackendMigration",
		);
		expect(preview).toBeDefined();
		const payload = (preview!.body as { payload: Record<string, unknown> })
			.payload;
		// Source must be the backend descriptor, not the full ProjectDescriptorDto.
		expect(payload.source).toEqual(backend);
		expect(payload.source).not.toHaveProperty("projectId");
		expect(payload.target).toEqual(target);
	});

	test("applyBackendMigration sends the current backend descriptor as source", async () => {
		const requests: { url: string; body: unknown }[] = [];
		const backend = { kind: "jsonl" as const, path: ".macro/state.jsonl" };
		const configuration = { backend, projectId: "p1", displayName: "Project" };
		global.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
			const body = init?.body ? JSON.parse(init.body as string) : undefined;
			requests.push({ url: String(url), body });
			if (body?.type === "project.getConfiguration") {
				return new Response(
					JSON.stringify({ ok: true, payload: configuration }),
					{ status: 200 },
				);
			}
			return new Response(
				JSON.stringify({
					ok: true,
					payload: {
						status: "migrated",
						configuration,
						plan: {
							source: backend,
							target: { kind: "sqlite", path: ".macro/s.db" },
							participants: [],
							historyCount: 0,
							scratchpadCount: 0,
							warnings: [],
							sourceDigest: "",
						},
						snapshot: {},
					},
				}),
				{ status: 200 },
			);
		}) as typeof fetch;

		const client = new BrowserHostClient("http://test");
		(client as unknown as { sessionId: string }).sessionId = "s1";

		const target = { kind: "sqlite" as const, path: ".macro/s.db" };
		await client.applyBackendMigration(target, "1");

		const apply = requests.find(
			(r) =>
				(r.body as { type?: string })?.type === "project.applyBackendMigration",
		);
		expect(apply).toBeDefined();
		const payload = (apply!.body as { payload: Record<string, unknown> })
			.payload;
		expect(payload.source).toEqual(backend);
		expect(payload.source).not.toHaveProperty("projectId");
		expect(payload.expectedRevision).toBe("1");
	});
});
