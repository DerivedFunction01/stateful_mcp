import { isAbsolute, relative, resolve, sep } from "node:path";
import type { MessageParam } from "@stateful-mcp/macro-protocol";

/**
 * Pure project file/path utilities.
 *
 * These functions reproduce the path-security semantics that today live inside
 * `host-session-manager.ts` (isWithin, resolveProjectPath,
 * resolveProjectPathAbsolute, validateSegment) so they can be reused and unit
 * tested without a session. They are intentionally free of any session, event,
 * or filesystem state so the host manager can later delegate to them without
 * changing observable behavior.
 */

/**
 * Path segments that are never editable through the project file API. This is
 * the exact allow-list check used by `resolveProjectPath`: `..`, `.macro`,
 * `.macro-user`, `.git`, and `node_modules` are rejected even when they would
 * otherwise resolve inside the root.
 */
export const EDIT_RESERVED_SEGMENTS = [
	".macro",
	".macro-user",
	".git",
	"node_modules",
] as const;

/**
 * Segments the file-tree watcher and tree projection ignore. This matches the
 * skip rules in `startFileTreeWatcher` / `watchProjectDirectories`. Note that
 * `node_modules` is editable but still walked, so it is intentionally absent
 * from this list.
 */
export const WATCH_IGNORED_SEGMENTS = [
	".macro",
	".macro-user",
	".git",
] as const;

export class ProjectPathError extends Error {
	readonly messageKey: string;
	readonly messageParams?: Readonly<Record<string, MessageParam>>;
	constructor(
		readonly code: string,
		messageKey: string,
		readonly retryable = false,
		messageParams?: Readonly<Record<string, MessageParam>>,
	) {
		super(messageKey);
		this.messageKey = messageKey;
		this.messageParams = messageParams;
	}
}

/**
 * Returns true when `target` resolves to `root` itself or a descendant of it.
 * Exact copy of the manager's `isWithin` guard.
 */
export function isWithinProjectRoot(root: string, target: string): boolean {
	const child = relative(resolve(root), resolve(target));
	return child === "" || (!child.startsWith(`..${sep}`) && child !== "..");
}

export function isReservedEditSegment(segment: string): boolean {
	return (EDIT_RESERVED_SEGMENTS as readonly string[]).includes(segment);
}

export function isIgnoredWatchSegment(segment: string): boolean {
	return (WATCH_IGNORED_SEGMENTS as readonly string[]).includes(segment);
}

/** Normalizes back-slashes to forward-slashes without touching the filesystem. */
export function normalizeToPosix(child: string): string {
	return child.replaceAll("\\", "/");
}

/** Splits a path into its non-empty, posix-style segments. */
export function splitProjectSegments(child: string): string[] {
	return normalizeToPosix(child).split("/").filter(Boolean);
}

/**
 * Validates a single path segment (file or directory name). Throws a
 * `ProjectPathError` with the same code/message the host manager uses for
 * `validateSegment`.
 */
export function validatePathSegment(name: string): void {
	if (
		!name.trim() ||
		name === "." ||
		name === ".." ||
		name.includes("/") ||
		name.includes("\\") ||
		name.includes("\0")
	)
		throw new ProjectPathError(
			"INVALID_REQUEST",
			"project.path.segmentInvalid",
			false,
		);
}

/**
 * Resolves a project-relative `child` against `root`, enforcing the same rules
 * as `resolveProjectPath`:
 *  - absolute inputs are rejected,
 *  - `..` and reserved segments are rejected,
 *  - the resolved path must stay within `root` (and may be disallowed from
 *    equalling the root when `allowRoot` is false).
 */
export function resolveProjectRelativePath(
	root: string,
	child: string,
	allowRoot = true,
): string {
	const resolvedRoot = resolve(root);
	if (isAbsolute(child))
		throw new ProjectPathError(
			"INVALID_REQUEST",
			"project.path.relativeRequired",
			false,
		);
	const segments = splitProjectSegments(child);
	if (
		segments.some(
			(segment) => segment === ".." || isReservedEditSegment(segment),
		)
	)
		throw new ProjectPathError(
			"INVALID_REQUEST",
			"project.path.outsideEditableArea",
			false,
		);
	const result = resolve(resolvedRoot, normalizeToPosix(child));
	if (
		(!allowRoot && result === resolvedRoot) ||
		!isWithinProjectRoot(resolvedRoot, result)
	)
		throw new ProjectPathError(
			"INVALID_REQUEST",
			"project.path.escapesRoot",
			false,
		);
	return result;
}

/**
 * Resolves an absolute `child` against `root`, enforcing the same rule as
 * `resolveProjectPathAbsolute`: the result must be within `root`, and an
 * absolute reference equal to the root is only accepted when it literally
 * equals `root`.
 */
export function resolveProjectAbsolutePath(
	root: string,
	child: string,
): string {
	const resolvedRoot = resolve(root);
	const result = resolve(child);
	if (
		!isWithinProjectRoot(resolvedRoot, result) ||
		(result === resolvedRoot && child !== root)
	)
		throw new ProjectPathError(
			"INVALID_REQUEST",
			"project.path.escapesRoot",
			false,
		);
	return result;
}

/** Returns the posix-style project-relative form of an absolute path. */
export function toProjectRelativePath(
	root: string,
	absolutePath: string,
): string {
	return relative(resolve(root), resolve(absolutePath)).split(sep).join("/");
}

export interface ProjectTreeEntry {
	readonly relativePath: string;
	readonly absolutePath: string;
	readonly isDirectory: boolean;
}

export interface ProjectTreeReader {
	readdir(
		path: string,
	): Promise<readonly { readonly name: string; isDirectory(): boolean }[]>;
}

/**
 * Recursively lists the project tree under `root`, skipping the same ignored
 * segments the file-tree watcher skips. The directory reader is injected so the
 * function stays pure and testable; the host manager can pass `node:fs/promises`
 * `readdir(..., { withFileTypes: true })`.
 */
export async function collectProjectTree(
	root: string,
	reader: ProjectTreeReader,
): Promise<ProjectTreeEntry[]> {
	const resolvedRoot = resolve(root);
	const entries: ProjectTreeEntry[] = [];
	const visit = async (directory: string): Promise<void> => {
		let dirents: readonly { readonly name: string; isDirectory(): boolean }[];
		try {
			dirents = await reader.readdir(directory);
		} catch {
			return;
		}
		for (const entry of dirents) {
			if (isIgnoredWatchSegment(entry.name)) continue;
			const absolutePath = resolve(directory, entry.name);
			const relativePath = toProjectRelativePath(resolvedRoot, absolutePath);
			const isDirectory = entry.isDirectory();
			entries.push({ relativePath, absolutePath, isDirectory });
			if (isDirectory) await visit(absolutePath);
		}
	};
	await visit(resolvedRoot);
	return entries;
}

/**
 * Small integration surface: a bound root that exposes the pure path utilities
 * as instance methods. The host manager can construct one per project and
 * delegate its resolution/validation to it, keeping the security semantics in
 * a single place.
 */
export class ProjectFileService {
	constructor(private readonly root: string) {}

	get rootPath(): string {
		return resolve(this.root);
	}

	isWithin(target: string): boolean {
		return isWithinProjectRoot(this.rootPath, target);
	}

	resolveRelative(child: string, allowRoot = true): string {
		return resolveProjectRelativePath(this.rootPath, child, allowRoot);
	}

	resolveAbsolute(child: string): string {
		return resolveProjectAbsolutePath(this.rootPath, child);
	}

	toRelative(absolutePath: string): string {
		return toProjectRelativePath(this.rootPath, absolutePath);
	}

	validateSegment(name: string): void {
		validatePathSegment(name);
	}
}
