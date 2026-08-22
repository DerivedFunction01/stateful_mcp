import { addCollection } from "@iconify/react";
import vscodeIcons from "@iconify-json/vscode-icons/icons.json";

// Register vscode-icons collection into @iconify/react memory cache
try {
	addCollection(vscodeIcons as any);
} catch {
	// Fallback silently if already registered
}

const FILENAME_MAP: Readonly<Record<string, string>> = {
	"package.json": "vscode-icons:file-type-npm",
	"package-lock.json": "vscode-icons:file-type-npm",
	"tsconfig.json": "vscode-icons:file-type-tsconfig",
	"tsconfig.node.json": "vscode-icons:file-type-tsconfig",
	".gitignore": "vscode-icons:file-type-git",
	".gitattributes": "vscode-icons:file-type-git",
	".gitmodules": "vscode-icons:file-type-git",
	dockerfile: "vscode-icons:file-type-docker",
	"docker-compose.yml": "vscode-icons:file-type-docker",
	"docker-compose.yaml": "vscode-icons:file-type-docker",
	"bunfig.toml": "vscode-icons:file-type-bun",
	"bun.lockb": "vscode-icons:file-type-bun",
	"project.json": "vscode-icons:file-type-json-schema",
	"readme.md": "vscode-icons:file-type-markdown",
	license: "vscode-icons:file-type-license",
	"license.md": "vscode-icons:file-type-license",
	"license.txt": "vscode-icons:file-type-license",
	"biome.json": "vscode-icons:file-type-biome",
	"eslint.config.js": "vscode-icons:file-type-eslint",
	"eslint.config.mjs": "vscode-icons:file-type-eslint",
	".eslintrc": "vscode-icons:file-type-eslint",
	".eslintrc.json": "vscode-icons:file-type-eslint",
	".eslintrc.js": "vscode-icons:file-type-eslint",
	".prettierrc": "vscode-icons:file-type-prettier",
	".prettierrc.json": "vscode-icons:file-type-prettier",
	".env": "vscode-icons:file-type-dotenv",
	".env.local": "vscode-icons:file-type-dotenv",
	".env.example": "vscode-icons:file-type-dotenv",
	"vite.config.ts": "vscode-icons:file-type-vite",
	"vite.config.js": "vscode-icons:file-type-vite",
};

const EXTENSION_MAP: Readonly<Record<string, string>> = {
	ts: "vscode-icons:file-type-typescript",
	mts: "vscode-icons:file-type-typescript",
	cts: "vscode-icons:file-type-typescript",
	tsx: "vscode-icons:file-type-reactts",
	js: "vscode-icons:file-type-js-official",
	mjs: "vscode-icons:file-type-js-official",
	cjs: "vscode-icons:file-type-js-official",
	jsx: "vscode-icons:file-type-reactjs",
	py: "vscode-icons:file-type-python",
	pyc: "vscode-icons:file-type-python",
	pyd: "vscode-icons:file-type-python",
	json: "vscode-icons:file-type-json",
	jsonl: "vscode-icons:file-type-json",
	html: "vscode-icons:file-type-html",
	htm: "vscode-icons:file-type-html",
	css: "vscode-icons:file-type-css",
	scss: "vscode-icons:file-type-scss",
	sass: "vscode-icons:file-type-sass",
	less: "vscode-icons:file-type-less",
	md: "vscode-icons:file-type-markdown",
	markdown: "vscode-icons:file-type-markdown",
	sql: "vscode-icons:file-type-sql",
	sqlite: "vscode-icons:file-type-sqlite",
	duckdb: "vscode-icons:file-type-sql",
	db: "vscode-icons:file-type-sqlite",
	sh: "vscode-icons:file-type-shell",
	bash: "vscode-icons:file-type-shell",
	zsh: "vscode-icons:file-type-shell",
	fish: "vscode-icons:file-type-shell",
	yaml: "vscode-icons:file-type-yaml",
	yml: "vscode-icons:file-type-yaml",
	toml: "vscode-icons:file-type-toml",
	xml: "vscode-icons:file-type-xml",
	csv: "vscode-icons:file-type-excel",
	tsv: "vscode-icons:file-type-excel",
	png: "vscode-icons:file-type-image",
	jpg: "vscode-icons:file-type-image",
	jpeg: "vscode-icons:file-type-image",
	gif: "vscode-icons:file-type-image",
	svg: "vscode-icons:file-type-svg",
	webp: "vscode-icons:file-type-image",
	ico: "vscode-icons:file-type-favicon",
	pdf: "vscode-icons:file-type-pdf",
	macro: "vscode-icons:file-type-assembly",
	txt: "vscode-icons:file-type-text",
	log: "vscode-icons:file-type-text",
	rs: "vscode-icons:file-type-rust",
	go: "vscode-icons:file-type-go",
	java: "vscode-icons:file-type-java",
	c: "vscode-icons:file-type-c",
	cpp: "vscode-icons:file-type-cpp",
	h: "vscode-icons:file-type-cheader",
	hpp: "vscode-icons:file-type-cppheader",
	lua: "vscode-icons:file-type-lua",
	wasm: "vscode-icons:file-type-wasm",
	zip: "vscode-icons:file-type-zip",
	tar: "vscode-icons:file-type-zip",
	gz: "vscode-icons:file-type-zip",
};

export function getFileIcon(filename: string): string {
	const lower = filename.toLowerCase().trim();
	if (FILENAME_MAP[lower]) return FILENAME_MAP[lower];
	const ext =
		lower.startsWith(".") && !lower.includes(".", 1)
			? lower.slice(1)
			: (lower.split(".").pop() ?? "");
	return EXTENSION_MAP[ext] ?? "vscode-icons:file-type-text";
}
