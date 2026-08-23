import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const shellSource = readFileSync(
	resolve(import.meta.dir, "../src/components/WorkbenchShell.tsx"),
	"utf8",
);
const stylesSource = readFileSync(
	resolve(import.meta.dir, "../src/styles/index.css"),
	"utf8",
);

describe("workbench dock ordering", () => {
	test("adds the inspector dock direction to the shell", () => {
		expect(shellSource).toContain(
			"className={`workbench-shell dock-${inspectorPosition}`}",
		);
	});

	test("moves the primary sidebar after the editor when the inspector is left-docked", () => {
		expect(stylesSource).toContain(
			".workbench-shell.dock-left .workbench-primary-sidebar {\n\torder: 4;",
		);
		expect(stylesSource).toContain(
			'.workbench-shell.dock-left [data-region="sidebar"] {\n\torder: 3;',
		);
		expect(stylesSource).toContain(
			'.workbench-shell.dock-left [data-region="inspector"] {\n\torder: 1;',
		);
	});

	test("mirrors the outer activity rail and sidebar boundaries", () => {
		expect(stylesSource).toContain(
			".app-body.inspector-docked-left .activity-rail {\n\torder: 2;\n\tborder-right: none;",
		);
		expect(stylesSource).toContain(
			".app-body.inspector-docked-left .rail-button.active {",
		);
		expect(stylesSource).toContain(
			".workbench-shell.dock-left .workbench-primary-sidebar {\n\torder: 4;\n\tborder-right: none;",
		);
	});
});
