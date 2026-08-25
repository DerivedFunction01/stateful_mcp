import { describe, expect, test } from "bun:test";
import {
	assertSafeDetail,
	errorDescriptor,
	isErrorDescriptor,
	isJsonValue,
	isStructuredError,
	normalizeBoundaryError,
	structuredError,
} from "../src/index";

describe("canonical protocol errors", () => {
	test("builds a descriptor without presentation fallbacks", () => {
		expect(errorDescriptor("project.notFound", { projectId: "p1" })).toEqual({
			messageKey: "project.notFound",
			messageParams: { projectId: "p1" },
		});
	});

	test("keeps behavior and safe details separate from translation params", () => {
		expect(
			structuredError({
				code: "PROJECT_BUSY",
				messageKey: "project.busy",
				messageParams: { name: "demo" },
				retryable: true,
				status: 409,
				safeDetails: { activeJobs: 2 },
				cause: new Error("private detail"),
			}),
		).toEqual({
			code: "PROJECT_BUSY",
			messageKey: "project.busy",
			messageParams: { name: "demo" },
			retryable: true,
			status: 409,
			safeDetails: { activeJobs: 2 },
		});
	});

	test("normalizes unknown errors to a safe localized failure", () => {
		expect(normalizeBoundaryError(new Error("do not leak this"))).toEqual({
			code: "HOST_REQUEST_FAILED",
			messageKey: "host.requestFailed",
		});
	});

	test("isJsonValue rejects non-serializable values", () => {
		expect(isJsonValue({ a: 1, b: [true, "x"] })).toBe(true);
		expect(isJsonValue(() => 1)).toBe(false);
		expect(isJsonValue(undefined)).toBe(false);
		expect(isJsonValue(Symbol("x"))).toBe(false);
		expect(isJsonValue({ nested: () => 1 })).toBe(false);
	});

	test("assertSafeDetail strips unsafe values to undefined", () => {
		expect(assertSafeDetail(42)).toBe(42);
		expect(assertSafeDetail({ ok: [1, "two"] })).toEqual({ ok: [1, "two"] });
		expect(assertSafeDetail(() => 1)).toBeUndefined();
	});

	test("isErrorDescriptor validates shape", () => {
		expect(isErrorDescriptor({ messageKey: "k" })).toBe(true);
		expect(isErrorDescriptor({ messageKey: "k", messageParams: {} })).toBe(
			true,
		);
		expect(isErrorDescriptor({ messageKey: 5 })).toBe(false);
		expect(isErrorDescriptor({ messageParams: {} })).toBe(false);
		expect(isErrorDescriptor(null)).toBe(false);
	});

	test("isStructuredError validates optional behavior fields", () => {
		expect(
			isStructuredError({
				messageKey: "k",
				code: "C",
				retryable: true,
				status: 500,
				safeDetails: { x: [1, "y"] },
			}),
		).toBe(true);
		expect(isStructuredError({ messageKey: "k", retryable: "yes" })).toBe(
			false,
		);
		expect(
			isStructuredError({ messageKey: "k", safeDetails: { f: () => 1 } }),
		).toBe(false);
	});

	test("structuredError drops cause and never serializes it", () => {
		const cause = new Error("internal");
		const err = structuredError({
			messageKey: "x.fail",
			messageParams: { id: 3 },
			cause,
		});
		expect("cause" in err).toBe(false);
		expect(JSON.parse(JSON.stringify(err))).toEqual({
			messageKey: "x.fail",
			messageParams: { id: 3 },
		});
	});

	test("descriptor metadata survives JSON round-trip intact", () => {
		const original = structuredError({
			code: "B",
			messageKey: "b.msg",
			messageParams: { n: 1 },
			retryable: false,
			status: 422,
			safeDetails: { path: "x/y" },
		});
		expect(JSON.parse(JSON.stringify(original))).toEqual(original);
	});
});
