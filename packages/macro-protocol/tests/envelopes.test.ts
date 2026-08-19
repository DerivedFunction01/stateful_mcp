import { describe, expect, test } from "bun:test";
import { failure, isProtocolVersion, MACRO_PROTOCOL_VERSION, response } from "../src/index";

describe("macro protocol envelopes", () => {
	test("keeps request correlation and protocol version", () => {
		const result = response("request-1", { value: 42 });
		expect(result).toEqual({ version: MACRO_PROTOCOL_VERSION, requestId: "request-1", ok: true, payload: { value: 42 } });
	});

	test("represents structured failures without thrown objects", () => {
		expect(failure("request-2", { code: "STALE_REVISION", message: "Stale", retryable: true })).toEqual({ version: 1, requestId: "request-2", ok: false, error: { code: "STALE_REVISION", message: "Stale", retryable: true } });
	});

	test("rejects protocol versions it does not understand", () => {
		expect(isProtocolVersion(1)).toBe(true);
		expect(isProtocolVersion(2)).toBe(false);
	});
});
