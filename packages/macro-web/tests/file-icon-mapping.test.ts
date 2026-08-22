import { describe, expect, test } from "bun:test";
import { getFileIcon } from "../src/lib/file-icon-resolver";

describe("File Icon Resolver", () => {
	test("resolves special filenames to exact icons", () => {
		expect(getFileIcon("package.json")).toBe("vscode-icons:file-type-npm");
		expect(getFileIcon("tsconfig.json")).toBe(
			"vscode-icons:file-type-tsconfig",
		);
		expect(getFileIcon(".gitignore")).toBe("vscode-icons:file-type-git");
		expect(getFileIcon("Dockerfile")).toBe("vscode-icons:file-type-docker");
		expect(getFileIcon("bunfig.toml")).toBe("vscode-icons:file-type-bun");
		expect(getFileIcon("bun.lockb")).toBe("vscode-icons:file-type-bun");
		expect(getFileIcon("project.json")).toBe(
			"vscode-icons:file-type-json-schema",
		);
		expect(getFileIcon("README.md")).toBe("vscode-icons:file-type-markdown");
	});

	test("resolves file extensions to corresponding language icons", () => {
		expect(getFileIcon("App.tsx")).toBe("vscode-icons:file-type-reactts");
		expect(getFileIcon("index.ts")).toBe("vscode-icons:file-type-typescript");
		expect(getFileIcon("server.js")).toBe("vscode-icons:file-type-js-official");
		expect(getFileIcon("component.jsx")).toBe("vscode-icons:file-type-reactjs");
		expect(getFileIcon("model.py")).toBe("vscode-icons:file-type-python");
		expect(getFileIcon("query.sql")).toBe("vscode-icons:file-type-sql");
		expect(getFileIcon("notes.macro")).toBe("vscode-icons:file-type-assembly");
		expect(getFileIcon("styles.css")).toBe("vscode-icons:file-type-css");
		expect(getFileIcon("page.html")).toBe("vscode-icons:file-type-html");
		expect(getFileIcon("config.yaml")).toBe("vscode-icons:file-type-yaml");
		expect(getFileIcon("data.json")).toBe("vscode-icons:file-type-json");
		expect(getFileIcon("script.sh")).toBe("vscode-icons:file-type-shell");
		expect(getFileIcon("logo.svg")).toBe("vscode-icons:file-type-svg");
		expect(getFileIcon("photo.png")).toBe("vscode-icons:file-type-image");
	});

	test("falls back to text icon for unknown extensions", () => {
		expect(getFileIcon("unknown_file.xyz123")).toBe(
			"vscode-icons:file-type-text",
		);
	});
});
