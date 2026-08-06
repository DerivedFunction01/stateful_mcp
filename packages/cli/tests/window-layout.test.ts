import { describe, expect, test } from "bun:test";
import {
	deriveWindowLayout,
	FOOTER_ROWS,
	MACRO_EDITOR_ROWS,
	STATUS_ROWS,
	WIDE_LAYOUT_BREAKPOINT,
} from "../src/lib/editor/window-layout";

describe("window layout geometry", () => {
	test("gives wide layouts a full-height details column", () => {
		const layout = deriveWindowLayout({
			columns: WIDE_LAYOUT_BREAKPOINT + 30,
			rows: 40,
			sidebarOpen: true,
		});

		expect(layout.wide).toBe(true);
		expect(layout.detailsWidth).toBeGreaterThan(0);
		expect(layout.detailsRows).toBe(40);
		expect(layout.workspaceRows).toBe(
			40 - MACRO_EDITOR_ROWS - STATUS_ROWS - FOOTER_ROWS,
		);
		expect(layout.bottomRows).toBe(
			MACRO_EDITOR_ROWS + STATUS_ROWS + FOOTER_ROWS,
		);
	});

	test("does not reserve details width when the sidebar is closed", () => {
		const open = deriveWindowLayout({
			columns: 160,
			rows: 40,
			sidebarOpen: true,
		});
		const closed = deriveWindowLayout({
			columns: 160,
			rows: 40,
			sidebarOpen: false,
		});

		expect(closed.detailsWidth).toBe(0);
		expect(closed.centerWidth).toBeGreaterThan(open.centerWidth);
	});

	test("keeps the bottom contract valid for short terminals", () => {
		const layout = deriveWindowLayout({
			columns: 80,
			rows: 2,
			sidebarOpen: false,
		});

		expect(layout.workspaceRows).toBeGreaterThanOrEqual(1);
		expect(layout.bottomRows).toBeLessThanOrEqual(2);
	});

	test("collapses the wide side column below the breakpoint", () => {
		const layout = deriveWindowLayout({
			columns: WIDE_LAYOUT_BREAKPOINT - 1,
			rows: 30,
			sidebarOpen: true,
		});

		expect(layout.wide).toBe(false);
		expect(layout.detailsWidth).toBe(0);
		expect(layout.historyWidth).toBe(WIDE_LAYOUT_BREAKPOINT - 1);
	});
});
