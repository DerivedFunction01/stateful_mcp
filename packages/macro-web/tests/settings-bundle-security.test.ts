import { describe, expect, test } from "bun:test";
import type { SettingsBundleDto } from "@stateful-mcp/macro-protocol";
import {
	prepareImportedBundle,
	redactSensitiveBundle,
} from "../src/server/host-session-manager";

const schema = [
	{
		path: ["credentials", "token"],
		type: "string" as const,
		title: "Token",
		sensitive: true,
	},
	{
		path: ["appearance", "theme"],
		type: "string" as const,
		title: "Theme",
	},
];

function bundle(workspace: Record<string, unknown>): SettingsBundleDto {
	return {
		version: 1,
		exportedAt: new Date(0).toISOString(),
		workspace,
		profiles: { clinical: { locale: "en" } },
		extensions: {},
	};
}

describe("settings bundle security boundary", () => {
	test("redacts sensitive values without inventing missing fields", () => {
		const exported = redactSensitiveBundle(
			bundle({ credentials: { token: "secret" } }),
			schema,
		);
		expect(exported.workspace).toEqual({
			credentials: { token: "••••••••" },
		});
	});

	test("omits sensitive imports and rejects unrelated profiles", () => {
		const prepared = prepareImportedBundle(
			{
				...bundle({
					credentials: { token: "••••••••" },
					appearance: { theme: "dark" },
				}),
				profiles: {
					clinical: { locale: "en" },
					finance: { locale: "en" },
				},
			},
			"clinical",
			schema,
		);
		expect(prepared.diagnostics.some((item) => item.severity === "error")).toBe(
			true,
		);
		expect((prepared.bundle.workspace as any).credentials).toEqual({});
	});

	test("rejects schema-invalid imported values", () => {
		const prepared = prepareImportedBundle(
			bundle({ appearance: { theme: 42 } }),
			"clinical",
			schema,
		);
		expect(prepared.diagnostics).toEqual([
			expect.objectContaining({
				severity: "error",
				path: ["appearance", "theme"],
			}),
		]);
	});

	test("applies sensitive schema paths to their bundle section", () => {
		const exported = redactSensitiveBundle(
			{
				...bundle({ extensions: { clinical: { token: "secret" } } }),
				extensions: { clinical: { token: "secret" } },
			},
			[
				{
					path: ["extensions", "clinical", "token"],
					type: "string",
					title: "Clinical token",
					sensitive: true,
				},
			],
		);
		expect(exported.workspace).toEqual({
			extensions: { clinical: { token: "secret" } },
		});
		expect(exported.extensions?.clinical?.token).toBe("••••••••");
	});
});
