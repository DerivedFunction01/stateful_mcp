import { describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { createMacroHost } from "@stateful-mcp/macro-host";
import type {
	ValueAuthoringProfileDto,
	ValueAuthoringResult,
} from "@stateful-mcp/macro-protocol";
import { HostSessionManager } from "../src/server/host-session-manager";

async function createSettingsSession() {
	const root = await mkdtemp(
		join(process.env.TMPDIR ?? "/tmp", "macro-value-authoring-"),
	);
	const host = await createMacroHost({ defaults: {} });
	const sessions = new HostSessionManager(host, 60_000);
	const snapshot = await sessions.create();
	await sessions.initProject(snapshot.sessionId, root, "Authoring Project");
	return { host, sessions, root, sessionId: snapshot.sessionId };
}

function dateProfile(): ValueAuthoringProfileDto {
	return {
		id: "wizard-date",
		values: {
			dateTime: {
				formats: {
					"date.iso": {
						id: "date.iso",
						kind: "date",
						source: "YYYY-MM-DD",
					},
				},
				display: { date: "date.iso" },
				parse: { date: ["date.iso"], time: [], datetime: [] },
			},
		},
	} as unknown as ValueAuthoringProfileDto;
}

async function firstResult(
	promise: Promise<ValueAuthoringResult>,
): Promise<ValueAuthoringResult> {
	return promise;
}

async function currentRevision(
	sessions: HostSessionManager,
	sessionId: string,
): Promise<string> {
	const probe = await sessions.valueAuthoring(sessionId, {
		operation: "valueAuthoring.load",
		profileId: "__revision_probe__",
	});
	if (probe.status !== "loaded") throw new Error("probe load failed");
	return probe.settingsRevision;
}

describe("value authoring phase 2 host operations", () => {
	test("load returns draft with catalog metadata", async () => {
		const context = await createSettingsSession();
		try {
			const revision = await currentRevision(
				context.sessions,
				context.sessionId,
			);
			const saveResult = await context.sessions.valueAuthoring(
				context.sessionId,
				{
					operation: "valueAuthoring.save",
					profile: dateProfile(),
					expectedRevision: revision,
				},
			);
			expect(saveResult.status).toBe("saved");

			const loaded = await context.sessions.valueAuthoring(context.sessionId, {
				operation: "valueAuthoring.load",
				profileId: "wizard-date",
			});
			if (loaded.status !== "loaded") throw new Error("expected loaded");
			expect(loaded.draft.profile.id).toBe("wizard-date");
			expect(loaded.catalog).toBeDefined();
			expect(loaded.catalog?.terminalIds.length ?? 0).toBeGreaterThan(0);
		} finally {
			await context.sessions.disposeAll();
			await context.host.dispose();
		}
	});

	test("validate and preview use capability filtering on real samples", async () => {
		const context = await createSettingsSession();
		try {
			const validated = await context.sessions.valueAuthoring(
				context.sessionId,
				{
					operation: "valueAuthoring.validate",
					profile: dateProfile(),
				},
			);
			expect(validated.status).toBe("validated");

			const previewed = await firstResult(
				context.sessions.valueAuthoring(context.sessionId, {
					operation: "valueAuthoring.preview",
					profile: dateProfile(),
					samples: [{ input: "2026-08-26", argumentId: "when" }],
					request: {
						valueKind: "date-time",
						requiredFields: ["year", "month"],
					},
				}),
			);
			expect(previewed.status).toBe("previewed");
			if (previewed.status === "previewed" && previewed.preview) {
				const sample = previewed.preview.samples?.[0];
				expect(sample?.matched).toBe(true);
				expect(sample?.recipeId).toBe("date.date.iso");
				expect(sample?.canonicalValue).toMatchObject({
					year: 2026,
					month: 8,
					day: 26,
				});
			}

			const incompatible = await context.sessions.valueAuthoring(
				context.sessionId,
				{
					operation: "valueAuthoring.preview",
					profile: dateProfile(),
					samples: [{ input: "2026-08-26" }],
					request: {
						valueKind: "date-time",
						requiredFields: ["year", "hour"],
					},
				},
			);
			if (incompatible.status === "previewed" && incompatible.preview) {
				const sample = incompatible.preview.samples?.[0];
				expect(sample?.matched).toBe(false);
			} else {
				throw new Error("expected previewed result");
			}
		} finally {
			await context.sessions.disposeAll();
			await context.host.dispose();
		}
	});

	test("stale save conflicts without mutating the stored profile", async () => {
		const context = await createSettingsSession();
		try {
			const revision = await currentRevision(
				context.sessions,
				context.sessionId,
			);
			const saved = await context.sessions.valueAuthoring(context.sessionId, {
				operation: "valueAuthoring.save",
				profile: dateProfile(),
				expectedRevision: revision,
			});
			expect(saved.status).toBe("saved");
			const settingsRevision =
				saved.status === "saved" ? saved.settingsRevision : "";

			const stale = await context.sessions.valueAuthoring(context.sessionId, {
				operation: "valueAuthoring.save",
				profile: dateProfile(),
				expectedRevision: "ancient-revision",
			});
			expect(stale.status).toBe("conflict");

			const reloaded = await context.sessions.valueAuthoring(
				context.sessionId,
				{ operation: "valueAuthoring.load", profileId: "wizard-date" },
			);
			if (reloaded.status !== "loaded")
				throw new Error("expected reload after stale conflict");
			expect(reloaded.settingsRevision).toBe(settingsRevision);
		} finally {
			await context.sessions.disposeAll();
			await context.host.dispose();
		}
	});

	test("malformed profiles are rejected at the boundary", async () => {
		const context = await createSettingsSession();
		try {
			const malformed = await context.sessions.valueAuthoring(
				context.sessionId,
				{
					operation: "valueAuthoring.validate",
					profile: {
						aliasResolvers: { bad: true },
					} as unknown as ValueAuthoringProfileDto,
				},
			);
			expect(malformed.status).toBe("conflict");
			if (malformed.status === "conflict") {
				expect(malformed.code).toBe("REQUEST_PAYLOAD_MALFORMED");
			}

			const revision = await currentRevision(
				context.sessions,
				context.sessionId,
			);
			const missingParent = await context.sessions.valueAuthoring(
				context.sessionId,
				{
					operation: "valueAuthoring.save",
					profile: {
						...dateProfile(),
						extends: "no-such-parent",
					},
					expectedRevision: revision,
				},
			);
			expect(["saved", "blocked"]).toContain(missingParent.status);
		} finally {
			await context.sessions.disposeAll();
			await context.host.dispose();
		}
	});
});
