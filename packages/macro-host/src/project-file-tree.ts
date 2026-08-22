import { execFile } from "node:child_process";
import { lstat, readdir, stat } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import type {
	FileTreeItemDto,
	GitFileStatus,
} from "@stateful-mcp/macro-protocol";

const execFileAsync = promisify(execFile);
const IGNORED = new Set([".macro", ".macro-user", ".git"]);

function isWithin(root: string, target: string): boolean {
	const child = relative(root, target);
	return child === "" || (!child.startsWith(`..${sep}`) && child !== "..");
}

function statusFor(code: string): GitFileStatus | undefined {
	if (code === "??") return "untracked";
	const index = code[0] ?? " ";
	const worktree = code[1] ?? " ";
	if (index === "D" || worktree === "D") return "deleted";
	if (index !== " ") return "staged";
	if (worktree !== " ") return "modified";
	return undefined;
}

/** Parse `git status --porcelain=v1 -z` records, preserving arbitrary filenames. */
export function parseGitStatusPorcelain(
	output: string,
): ReadonlyMap<string, GitFileStatus> {
	const statuses = new Map<string, GitFileStatus>();
	const records = output.split("\0");
	for (let index = 0; index < records.length; index += 1) {
		const record = records[index];
		if (!record || record.length < 3) continue;
		const code = record.slice(0, 2);
		let path = record.slice(3);
		// Rename/copy records have an additional NUL-delimited original path.
		if (
			code[0] === "R" ||
			code[0] === "C" ||
			code[1] === "R" ||
			code[1] === "C"
		) {
			const destination = records[index + 1];
			if (destination) {
				path = destination;
				index += 1;
			}
		}
		const status = statusFor(code);
		if (status) statuses.set(path.replaceAll("\\", "/"), status);
	}
	return statuses;
}

async function readGitStatuses(
	root: string,
): Promise<ReadonlyMap<string, GitFileStatus>> {
	try {
		const result = await execFileAsync(
			"git",
			["status", "--porcelain=v1", "-z"],
			{
				cwd: root,
				maxBuffer: 4 * 1024 * 1024,
			},
		);
		return parseGitStatusPorcelain(result.stdout);
	} catch {
		return new Map();
	}
}

async function scanDirectory(
	root: string,
	directory: string,
	statuses: ReadonlyMap<string, GitFileStatus>,
): Promise<readonly FileTreeItemDto[]> {
	const entries = await readdir(directory, { withFileTypes: true });
	const result: FileTreeItemDto[] = [];
	for (const entry of entries) {
		if (entry.isDirectory() && IGNORED.has(entry.name)) continue;
		if (entry.isSymbolicLink()) continue;
		const absolute = resolve(directory, entry.name);
		if (!isWithin(root, absolute)) continue;
		const path = relative(root, absolute).split(sep).join("/");
		if (entry.isDirectory()) {
			result.push({
				name: entry.name,
				path,
				isDirectory: true,
				children: await scanDirectory(root, absolute, statuses),
				...(statuses.get(path) ? { gitStatus: statuses.get(path) } : {}),
			});
		} else if (entry.isFile()) {
			const metadata = await stat(absolute);
			result.push({
				name: entry.name,
				path,
				isDirectory: false,
				size: metadata.size,
				mtime: metadata.mtimeMs,
				...(statuses.get(path) ? { gitStatus: statuses.get(path) } : {}),
			});
		}
	}
	return result.sort(
		(a, b) =>
			Number(b.isDirectory) - Number(a.isDirectory) ||
			a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
	);
}

export async function getProjectFileTree(
	projectRoot: string,
): Promise<readonly FileTreeItemDto[]> {
	const root = resolve(projectRoot);
	await lstat(root);
	const statuses = await readGitStatuses(root);
	return scanDirectory(root, root, statuses);
}
