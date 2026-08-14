import { readFile } from "node:fs/promises";
import { atomicWriteFile, HistoryConflictError } from "@stateful-mcp/core";
import type { HeadlessNotebookState } from "./notebook-state";

export interface HeadlessPersistedState {
	format: "stateful-headless-notebook";
	version: 1;
	revision: number;
	state: HeadlessNotebookState;
}

export class HeadlessSessionStore {
	constructor(readonly path: string) {}

	async load(initial?: HeadlessNotebookState): Promise<HeadlessPersistedState> {
		try {
			return JSON.parse(
				await readFile(this.path, "utf8"),
			) as HeadlessPersistedState;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
			return {
				format: "stateful-headless-notebook",
				version: 1,
				revision: 0,
				state: initial!,
			};
		}
	}

	async save(
		state: HeadlessNotebookState,
		expectedRevision: number,
	): Promise<HeadlessPersistedState> {
		const current = await this.load(state);
		if (current.revision !== expectedRevision)
			throw new HistoryConflictError("Headless notebook revision conflict", {
				expectedRevision,
				actualRevision: current.revision,
			});
		const next = {
			format: "stateful-headless-notebook" as const,
			version: 1 as const,
			revision: expectedRevision + 1,
			state,
		};
		await atomicWriteFile(this.path, JSON.stringify(next, null, 2));
		return next;
	}
}
