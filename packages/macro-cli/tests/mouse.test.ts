import { describe, expect, test } from "bun:test";
import type { MouseEvent } from "@opentui/core";
import { createTestRenderer } from "@opentui/core/testing";
import { createElement, createRoot } from "@opentui/react";
import { normalizeOpenTuiMouseEvent } from "../src/input/mouse";
import {
	createScratchpadGeometry,
	padScratchpadCell,
	scratchpadColumnAtX,
	scratchpadLineAtY,
} from "../src/ui/compositions/scratchpad-geometry";
import { TuiTabs } from "../src/ui/primitives/TuiTabs";
import {
	clampViewportOffset,
	createViewport,
	revealViewportIndex,
	scrollViewport,
} from "../src/ui/viewport";

describe("macro-cli native mouse adapter", () => {
	test("normalizes OpenTUI pointer and wheel events without decoding input", () => {
		const down = normalizeOpenTuiMouseEvent({
			type: "down",
			button: 0,
			x: 4,
			y: 7,
			modifiers: { shift: true, alt: false, ctrl: false },
		} as MouseEvent);
		expect(down).toMatchObject({
			type: "pointer",
			action: "press",
			button: "left",
			x: 4,
			y: 7,
			shift: true,
		});

		const wheel = normalizeOpenTuiMouseEvent({
			type: "scroll",
			button: 4,
			x: 2,
			y: 3,
			modifiers: { shift: false, alt: false, ctrl: true },
			scroll: { direction: "up", delta: 2 },
		} as MouseEvent);
		expect(wheel).toMatchObject({ type: "wheel", delta: -2, ctrl: true });
	});
});

describe("bounded TUI viewport", () => {
	test("clamps empty, exact-fit, and overflowing content", () => {
		expect(clampViewportOffset(4, 0, 10)).toBe(0);
		expect(clampViewportOffset(4, 10, 10)).toBe(0);
		expect(clampViewportOffset(99, 20, 5)).toBe(15);
		expect(createViewport(20, 5, 99)).toEqual({
			contentSize: 20,
			viewportSize: 5,
			offset: 15,
		});
	});

	test("scrolls and minimally reveals the active item", () => {
		const initial = createViewport(20, 5, 0);
		expect(scrollViewport(initial, 3).offset).toBe(3);
		expect(revealViewportIndex(initial, 8).offset).toBe(4);
		expect(revealViewportIndex(createViewport(20, 5, 10), 2).offset).toBe(2);
	});
});

describe("scratchpad geometry", () => {
	const line = (lineNumber: string) => ({
		id: lineNumber,
		lineNumber,
		text: "",
		state: "normal" as const,
	});

	test("keeps gutter geometry stable across line-number width changes", () => {
		const geometry = createScratchpadGeometry([
			line("1"),
			line("10"),
			line("100"),
		]);
		expect(geometry.lineNumberWidth).toBe(3);
		expect(geometry.contentStartColumn).toBe(10);
		expect(padScratchpadCell("1", geometry.lineNumberWidth)).toBe("1  ");
		expect(padScratchpadCell("100", geometry.lineNumberWidth)).toBe("100");
	});

	test("maps pointer coordinates through shared row and content geometry", () => {
		const geometry = createScratchpadGeometry([line("01"), line("02")], true);
		expect(scratchpadLineAtY(geometry, 4, 0)).toBe(4);
		expect(scratchpadLineAtY(geometry, 4, 2)).toBe(5);
		expect(scratchpadColumnAtX(geometry, geometry.contentStartColumn + 3)).toBe(
			3,
		);
	});
});

test("OpenTUI delivers a click to an interactive primitive", async () => {
	const setup = await createTestRenderer({
		width: 40,
		height: 10,
		useMouse: true,
	});
	let selected: string | undefined;
	createRoot(setup.renderer).render(
		createElement(TuiTabs, {
			tabs: [
				{ id: "first", label: "First" },
				{ id: "second", label: "Second" },
			],
			activeTabId: "first",
			onSelectTab: (id: string) => {
				selected = id;
			},
		}),
	);
	setup.renderer.start();
	await setup.flush();
	await setup.mockMouse.click(15, 0);
	await setup.flush();
	expect(selected).toBe("second");
	setup.renderer.destroy();
});
