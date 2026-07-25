import * as fs from "fs/promises";
import * as path from "path";
import type {
	Concept,
	ConceptRelation,
	CustomExpression,
	Namespace,
} from "../../../../middleware/dictionary/types";
import type {
	ConceptStoreBackend,
	ExpressionStoreBackend,
} from "../dict-backend";

async function fileOrDirExists(filePath: string): Promise<boolean> {
	try {
		await fs.access(filePath);
		return true;
	} catch {
		return false;
	}
}

async function truncateAndWrite(
	filePath: string,
	lines: string[],
): Promise<void> {
	await fs.mkdir(path.dirname(filePath), { recursive: true });
	await fs.writeFile(
		filePath,
		lines.join("\n") + (lines.length > 0 ? "\n" : ""),
		"utf-8",
	);
}

export class JsonlConceptStoreBackend implements ConceptStoreBackend {
	constructor(private filePath: string) {}

	async load(
		concepts: Map<string, Concept>,
		namespaces: Map<string, Namespace>,
		relations: ConceptRelation[],
	): Promise<void> {
		if (!(await fileOrDirExists(this.filePath))) return;
		const raw = await fs.readFile(this.filePath, "utf-8");
		for (const line of raw.split("\n")) {
			if (!line.trim()) continue;
			const entry = JSON.parse(line);
			if (entry.type === "concept") {
				concepts.set(entry.data.id, entry.data);
			} else if (entry.type === "namespace") {
				namespaces.set(entry.data.code, entry.data);
			} else if (entry.type === "relation") {
				relations.push(entry.data);
			}
		}
	}

	async save(
		concepts: Map<string, Concept>,
		namespaces: Map<string, Namespace>,
		relations: ConceptRelation[],
	): Promise<void> {
		const lines: string[] = [];
		for (const ns of namespaces.values()) {
			lines.push(JSON.stringify({ type: "namespace", data: ns }));
		}
		for (const c of concepts.values()) {
			lines.push(JSON.stringify({ type: "concept", data: c }));
		}
		for (const r of relations) {
			lines.push(JSON.stringify({ type: "relation", data: r }));
		}
		await truncateAndWrite(this.filePath, lines);
	}
}

export class JsonlExpressionStoreBackend implements ExpressionStoreBackend {
	constructor(private filePath: string) {}

	async load(expressions: CustomExpression[]): Promise<void> {
		if (!(await fileOrDirExists(this.filePath))) return;
		const raw = await fs.readFile(this.filePath, "utf-8");
		for (const line of raw.split("\n")) {
			if (!line.trim()) continue;
			const entry = JSON.parse(line);
			if (entry.type === "expression") {
				expressions.push(entry.data);
			}
		}
	}

	async save(expressions: CustomExpression[]): Promise<void> {
		const lines = expressions.map((e) =>
			JSON.stringify({ type: "expression", data: e }),
		);
		await truncateAndWrite(this.filePath, lines);
	}
}
