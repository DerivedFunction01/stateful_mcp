import { type FSWatcher, watch } from "node:fs";
import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import type { Session } from "../host-session/session-types";

const IGNORED_DIRECTORIES = new Set([".macro", ".macro-user", ".git"]);

export class ProjectFileWatcher {
	private readonly watchers = new WeakMap<Session, FSWatcher[]>();
	private readonly timers = new WeakMap<
		Session,
		ReturnType<typeof setTimeout>
	>();

	constructor(private readonly onChange: (session: Session) => void) {}

	start(session: Session): void {
		this.stop(session);
		const root = session.loaded.project?.rootPath;
		if (!root) return;
		const handleChange = (_event: string, filename: string | Buffer | null) => {
			const changedPath = filename?.toString().replaceAll("\\", "/") ?? "";
			if (changedPath.split("/").some((part) => IGNORED_DIRECTORIES.has(part)))
				return;
			const current = this.timers.get(session);
			if (current) clearTimeout(current);
			this.timers.set(
				session,
				setTimeout(() => {
					this.timers.delete(session);
					this.onChange(session);
					this.start(session);
				}, 100),
			);
		};
		void this.watchDirectories(session, resolve(root), handleChange);
	}

	stop(session: Session): void {
		const timer = this.timers.get(session);
		if (timer) clearTimeout(timer);
		this.timers.delete(session);
		for (const watcher of this.watchers.get(session) ?? []) watcher.close();
		this.watchers.delete(session);
	}

	private async watchDirectories(
		session: Session,
		root: string,
		onChange: (event: string, filename: string | Buffer | null) => void,
	): Promise<void> {
		const watchers: FSWatcher[] = [];
		const visit = async (directory: string): Promise<void> => {
			let entries;
			try {
				entries = await readdir(directory, { withFileTypes: true });
			} catch {
				return;
			}
			try {
				watchers.push(watch(directory, onChange));
			} catch {
				return;
			}
			for (const entry of entries) {
				if (entry.isDirectory() && !IGNORED_DIRECTORIES.has(entry.name))
					await visit(resolve(directory, entry.name));
			}
		};
		await visit(root);
		if (session.disposed) for (const watcher of watchers) watcher.close();
		else this.watchers.set(session, watchers);
	}
}
