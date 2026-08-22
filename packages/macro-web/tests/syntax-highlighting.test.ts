import { describe, expect, test } from "bun:test";
import hljs from "highlight.js/lib/common";
import { detectLanguage } from "../src/components/EditorSurfaceView";

describe("syntax highlighting & language detection", () => {
	test("detects languages from common file extensions", () => {
		expect(detectLanguage("main.ts")).toBe("typescript");
		expect(detectLanguage("App.tsx")).toBe("typescript");
		expect(detectLanguage("index.js")).toBe("javascript");
		expect(detectLanguage("script.py")).toBe("python");
		expect(detectLanguage("schema.sql")).toBe("sql");
		expect(detectLanguage("package.json")).toBe("json");
		expect(detectLanguage("README.md")).toBe("markdown");
		expect(detectLanguage("styles.css")).toBe("css");
		expect(detectLanguage("config.yaml")).toBe("yaml");
		expect(detectLanguage("build.sh")).toBe("bash");
		expect(detectLanguage("notes.txt")).toBeUndefined();
	});

	test("highlights code using highlight.js with detected language", () => {
		const lang = detectLanguage("test.ts");
		expect(lang).toBe("typescript");

		const code = "const count: number = 42;";
		const result = hljs.highlight(code, { language: lang!, ignoreIllegals: true });

		expect(result.value).toContain("hljs-keyword");
		expect(result.value).toContain("hljs-number");
	});
});
