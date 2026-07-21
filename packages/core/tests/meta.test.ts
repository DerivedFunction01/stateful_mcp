import * as fs from "fs/promises";
import * as path from "path";
import { resolveAboutOrExamples } from "../src/config/loader";
import type { ResourceLocator } from "../src/config/types";

export async function runMetaTests() {
	console.log("\n🚀 Starting Meta-Documentation & Examples tests...\n");

	const workspaceRoot = process.cwd();

	// Test Case 1: Fallback to Packaged Defaults
	console.log("🧪 Test Case 1: Fallback to Packaged Defaults");
	const middlewareAbout = await resolveAboutOrExamples(
		undefined,
		"config/about/middleware.md",
		workspaceRoot,
	);

	if (!middlewareAbout.includes("Middleware Architecture")) {
		throw new Error(
			`Expected default middleware about content, got: ${middlewareAbout}`,
		);
	}
	console.log("✓ Default about fallback resolved successfully.");

	// Test Case 2: Custom Resource Locator Resolution
	console.log("\n🧪 Test Case 2: Custom Resource Locator Resolution");
	const customFile = path.join(workspaceRoot, "scratch", "custom_about.md");
	await fs.mkdir(path.dirname(customFile), { recursive: true });
	await fs.writeFile(
		customFile,
		"# Custom Firm About\nEnforcing strict enterprise policies.",
	);

	const customAbout = await resolveAboutOrExamples(
		[{ _type: "file", path: "scratch/custom_about.md" } as ResourceLocator],
		"config/about/middleware.md",
		workspaceRoot,
	);

	if (
		!customAbout.includes("Custom Firm About") ||
		customAbout.includes("Middleware Architecture")
	) {
		throw new Error(`Expected custom about content, got: ${customAbout}`);
	}
	console.log("✓ Custom resource locator loaded successfully.");

	// Test Case 3: Concatenation and Pagination of Examples
	console.log("\n🧪 Test Case 3: Concatenation and Pagination of Examples");
	const customEx1 = path.join(workspaceRoot, "scratch", "ex1.md");
	const customEx2 = path.join(workspaceRoot, "scratch", "ex2.md");
	await fs.writeFile(customEx1, "Example One content");
	await fs.writeFile(customEx2, "Example Two content");

	const locators: ResourceLocator[] = [
		{ _type: "file", path: "scratch/ex1.md" },
		{ _type: "file", path: "scratch/ex2.md" },
	];

	const concatenated = await resolveAboutOrExamples(
		locators,
		"config/examples/filter.md",
		workspaceRoot,
	);
	if (
		!concatenated.includes("Example One content") ||
		!concatenated.includes("Example Two content")
	) {
		throw new Error(
			`Expected both examples concatenated, got: ${concatenated}`,
		);
	}

	// Verify manual page pagination
	const parts = concatenated.split("\n\n---\n\n");
	if (
		parts.length !== 2 ||
		parts[0] !== "Example One content" ||
		parts[1] !== "Example Two content"
	) {
		throw new Error(`Expected split size of 2, got: ${parts.length}`);
	}

	console.log("✓ Concatenation and pagination patterns verified successfully.");

	// Cleanup temporary files
	await fs.rm(customFile, { force: true });
	await fs.rm(customEx1, { force: true });
	await fs.rm(customEx2, { force: true });
}
