import { describe, expect, test } from "bun:test";
import {
	isLiteralNewlineEvent,
	unescapeReplacementString,
} from "../src/lib/search-utils";

function keyEvent(
	key: string,
	modifiers: Partial<
		Pick<KeyboardEvent, "shiftKey" | "ctrlKey" | "metaKey">
	> = {},
) {
	return {
		key,
		shiftKey: false,
		ctrlKey: false,
		metaKey: false,
		...modifiers,
	} as KeyboardEvent;
}

describe("search input keyboard helpers", () => {
	test("recognizes shift and primary Enter as literal newlines", () => {
		expect(isLiteralNewlineEvent(keyEvent("Enter", { shiftKey: true }))).toBe(
			true,
		);
		expect(isLiteralNewlineEvent(keyEvent("Enter", { ctrlKey: true }))).toBe(
			true,
		);
		expect(isLiteralNewlineEvent(keyEvent("Enter", { metaKey: true }))).toBe(
			true,
		);
		expect(isLiteralNewlineEvent(keyEvent("Enter"))).toBe(false);
	});

	test("keeps escaped replacement newlines and tabs supported", () => {
		expect(unescapeReplacementString(String.raw`line\n\tvalue`)).toBe(
			"line\n\tvalue",
		);
	});
});
