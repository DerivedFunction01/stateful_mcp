import { readdir } from "node:fs/promises";
import { dirname, extname, isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { LoadedExtension, MacroExtension } from "./contracts";
import {
	type ExtensionDiagnostic,
	ExtensionError,
	extensionDiagnostic,
} from "./errors";

export interface ExtensionLoaderOptions {
	directory: string;
}

export class ExtensionLoader {
	constructor(private readonly options: ExtensionLoaderOptions) {}

	async discover(): Promise<string[]> {
		const entries = await readdir(this.options.directory, {
			withFileTypes: true,
		});
		return entries
			.filter(
				(entry) =>
					!entry.name.startsWith(".") &&
					entry.isFile() &&
					[".ts", ".js"].includes(extname(entry.name)),
			)
			.map((entry) => join(this.options.directory, entry.name))
			.sort((left, right) => left.localeCompare(right));
	}

	async importFiles(files?: string[]): Promise<LoadedExtension[]> {
		const loaded: LoadedExtension[] = [];
		for (const sourceFile of files ?? (await this.discover())) {
			try {
				const module = await import(pathToFileURL(resolve(sourceFile)).href);
				const extension = module.default as MacroExtension | undefined;
				validateExtensionExport(extension, sourceFile);
				loaded.push({ extension: extension!, sourceFile: resolve(sourceFile) });
			} catch (error) {
				if (error instanceof ExtensionError) throw error;
				throw new ExtensionError(
					`Failed to import extension file '${sourceFile}': ${error instanceof Error ? error.message : String(error)}`,
					"EXTENSION_IMPORT_FAILED",
					undefined,
					sourceFile,
					error,
				);
			}
		}
		return loaded;
	}
}

export async function discoverExtensionFiles(
	directory: string,
): Promise<string[]> {
	return new ExtensionLoader({ directory }).discover();
}

export async function loadExtensionFiles(
	directory: string,
): Promise<LoadedExtension[]> {
	return new ExtensionLoader({ directory }).importFiles();
}

export function validateExtensionExport(
	extension: MacroExtension | undefined,
	sourceFile?: string,
): asserts extension is MacroExtension {
	if (
		!extension ||
		typeof extension !== "object" ||
		!extension.manifest ||
		typeof extension.activate !== "function"
	) {
		throw new ExtensionError(
			`Extension file '${sourceFile ?? "unknown"}' must default-export an extension`,
			"EXTENSION_EXPORT_MISSING",
			undefined,
			sourceFile,
		);
	}
	if (!extension.manifest.id || !extension.manifest.version) {
		throw new ExtensionError(
			`Extension file '${sourceFile ?? "unknown"}' has an invalid manifest`,
			"EXTENSION_MANIFEST_INVALID",
			undefined,
			sourceFile,
		);
	}
}

export function loaderDiagnostic(error: unknown): ExtensionDiagnostic {
	return extensionDiagnostic(error);
}

export function extensionRootDirectory(sourceFile: string): string {
	return dirname(isAbsolute(sourceFile) ? sourceFile : resolve(sourceFile));
}
