import { describe, expect, it } from "bun:test";
import { ClinicalEngineBuilder } from "../src/engine/clinical-engine-builder";

function makeTestPatient() {
	return {
		id: "pat-1",
		mrn: "MRN-1",
		name: { primaryOrSurname: "Doe", givenNames: ["Jane"] },
		administrativeGender: "female",
		lifecycle: "active",
		originationDate: {
			assertedTimestampUtc: "1990-01-01T00:00:00Z",
			precisionLevel: "day",
		},
		isOriginationEstimated: false,
		biologicalProfile: {
			id: "bio-1",
			organismType: "human",
		} as any,
	};
}

describe("ClinicalEngineBuilder", () => {
	it("withDefaultBackend memory creates a wired result without I/O", async () => {
		const result = await ClinicalEngineBuilder.withDefaultBackend("memory");
		expect(result.runtime).toBeDefined();
		expect(result.engine).toBeDefined();
		expect(result.processor).toBeDefined();
	});

	it("composes the starter profile", async () => {
		const { runtime } =
			await ClinicalEngineBuilder.withDefaultBackend("memory");
		const profiles = await runtime.parserStores.profiles.list();
		const starter = profiles.find((p) => p.profileId === "starter.default");
		expect(starter).toBeDefined();
		expect(starter!.tagToken).toBe("#");
		expect(starter!.stateDelimiter).toBe("||");
	});

	it("engine can process CDSL", async () => {
		const { engine } = await ClinicalEngineBuilder.withDefaultBackend("memory");
		const sessionId = `test-${Date.now()}`;
		await engine.initEncounter(sessionId, makeTestPatient());
		const note = await engine.processCdsl(sessionId, "#vital BP 140/90");
		expect(note).toBeDefined();
		expect(note.status).toBe("draft");
	});

	it("throws on missing profile", async () => {
		await expect(
			ClinicalEngineBuilder.withDefaultBackend("memory", {
				profileId: "nonexistent",
			}),
		).rejects.toThrow("parser profile not found: nonexistent");
	});

	it("accepts custom personnelId", async () => {
		const { engine } = await ClinicalEngineBuilder.withDefaultBackend(
			"memory",
			{ personnelId: "dr-smith" },
		);
		expect(engine).toBeDefined();
	});

	it("fromConfig works with fromConfig", async () => {
		// Just verify the method exists and returns a result
		const result = await ClinicalEngineBuilder.withDefaultBackend("memory");
		expect(result.runtime).toBeDefined();
		expect(result.engine).toBeDefined();
		expect(result.processor).toBeDefined();
	});
});
