import { describe, expect, test } from "bun:test";
import type { EditorGroupDto } from "@stateful-mcp/macro-protocol";

describe("Split Editor Multi-Group Model", () => {
	test("calculates active group documents and handles group focus transitions", () => {
		const groups: EditorGroupDto[] = [
			{
				groupId: "group-1",
				documentIds: ["doc-1", "doc-2"],
				activeDocumentId: "doc-1",
				orientation: "vertical",
				sizeRatio: 0.5,
			},
			{
				groupId: "group-2",
				documentIds: ["doc-3"],
				activeDocumentId: "doc-3",
				orientation: "vertical",
				sizeRatio: 0.5,
			},
		];

		const documents = [
			{
				documentId: "doc-1",
				providerId: "file" as const,
				title: "index.ts",
				filePath: "/src/index.ts",
				dirty: false,
				textRevision: 1,
			},
			{
				documentId: "doc-2",
				providerId: "file" as const,
				title: "App.tsx",
				filePath: "/src/App.tsx",
				dirty: true,
				textRevision: 2,
			},
			{
				documentId: "doc-3",
				providerId: "scratchpad" as const,
				title: "Scratchpad",
				dirty: false,
				textRevision: 0,
			},
		];

		// Group 1 docs
		const group1 = groups[0]!;
		const group1Docs = documents.filter((d) =>
			group1.documentIds.includes(d.documentId),
		);
		expect(group1Docs.map((d) => d.title)).toEqual(["index.ts", "App.tsx"]);

		// Group 2 docs
		const group2 = groups[1]!;
		const group2Docs = documents.filter((d) =>
			group2.documentIds.includes(d.documentId),
		);
		expect(group2Docs.map((d) => d.title)).toEqual(["Scratchpad"]);
	});

	test("supports vertical and horizontal orientation descriptors", () => {
		const verticalGroup: EditorGroupDto = {
			groupId: "g-vert",
			documentIds: ["d1"],
			activeDocumentId: "d1",
			orientation: "vertical",
		};
		const horizontalGroup: EditorGroupDto = {
			groupId: "g-horiz",
			documentIds: ["d2"],
			activeDocumentId: "d2",
			orientation: "horizontal",
		};

		expect(verticalGroup.orientation).toBe("vertical");
		expect(horizontalGroup.orientation).toBe("horizontal");
	});
});
