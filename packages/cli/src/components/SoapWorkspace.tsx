import {
	ClinicalDocumentRenderer,
	type ClinicalProseTemplate,
	ProseRenderLookupCache,
} from "@stateful-mcp/clinical";
import type { ClinicalDocumentReadModel } from "@stateful-mcp/clinical/clinical/clinical-document-types";
import { Box, Text, useInput } from "ink";
import { useEffect, useMemo, useRef, useState } from "react";

const SECTIONS = ["subjective", "objective", "assessment", "plan"] as const;

export function SoapWorkspace({
	document,
	templates,
	renderContext,
	loading = false,
	error,
	usageStore,
	sessionId,
	workspaceId,
}: {
	document: ClinicalDocumentReadModel | null;
	templates: readonly ClinicalProseTemplate[];
	renderContext?: import("@stateful-mcp/clinical").ProseRenderContext;
	loading?: boolean;
	error?: string | null;
	usageStore?: {
		recordUse(input: {
			templateId: string;
			usageKind: "root_confirmed" | "slot_override_confirmed";
			sessionId: string;
			workspaceId?: string;
			rootTemplateId?: string;
			slotKey?: string;
		}): Promise<void>;
	};
	sessionId: string;
	workspaceId?: string;
}) {
	const roots = useMemo(
		() =>
			templates.filter(
				(template) => template.kind === "root" && template.active !== false,
			),
		[templates],
	);
	const [rootIndex, setRootIndex] = useState(0);
	const [confirmedRootId, setConfirmedRootId] = useState<string | undefined>(
		roots[0]?.templateId,
	);
	const [previewRootId, setPreviewRootId] = useState<string | undefined>(
		roots[0]?.templateId,
	);
	const [message, setMessage] = useState("");
	const [renderedSections, setRenderedSections] = useState<
		Record<(typeof SECTIONS)[number], string[]>
	>({
		subjective: [],
		objective: [],
		assessment: [],
		plan: [],
	});
	const lookupCache = useRef(
		renderContext ? new ProseRenderLookupCache(renderContext) : undefined,
	);

	useInput((input, key) => {
		if (roots.length === 0) return;
		if (key.downArrow || input === "j") {
			const next = Math.min(roots.length - 1, rootIndex + 1);
			setRootIndex(next);
			setPreviewRootId(roots[next]?.templateId);
		}
		if (key.upArrow || input === "k") {
			const next = Math.max(0, rootIndex - 1);
			setRootIndex(next);
			setPreviewRootId(roots[next]?.templateId);
		}
		if (key.return) {
			const templateId = previewRootId;
			if (!templateId) return;
			setConfirmedRootId(templateId);
			setMessage(
				`confirmed ${roots[rootIndex]?.templateName ?? templateId}; slot overrides reset`,
			);
			void usageStore?.recordUse({
				templateId,
				usageKind: "root_confirmed",
				sessionId,
				workspaceId,
			});
		}
		if (key.escape) {
			setPreviewRootId(confirmedRootId);
			const index = roots.findIndex(
				(root) => root.templateId === confirmedRootId,
			);
			if (index >= 0) setRootIndex(index);
			setMessage("preview cancelled");
		}
	});

	useEffect(() => {
		if (!document) {
			setRenderedSections({
				subjective: [],
				objective: [],
				assessment: [],
				plan: [],
			});
			return;
		}
		let cancelled = false;
		void Promise.all(
			Object.values(document.records)
				.filter((record) => !record.removed)
				.map(async (record) => {
					const root = roots.find(
						(candidate) =>
							candidate.templateId === previewRootId &&
							candidate.targetSchema === record.schemaName,
					);
					const text = await ClinicalDocumentRenderer.renderRecordAsync(
						record.values,
						record.schemaName,
						templates,
						renderContext,
						root ? previewRootId : undefined,
						lookupCache.current,
					);
					return { section: root?.section ?? "objective", text };
				}),
		).then((items) => {
			if (cancelled) return;
			const next = {
				subjective: [],
				objective: [],
				assessment: [],
				plan: [],
			} as Record<(typeof SECTIONS)[number], string[]>;
			for (const item of items)
				if (item.text) next[item.section].push(item.text);
			setRenderedSections(next);
		});
		return () => {
			cancelled = true;
		};
	}, [document, previewRootId, renderContext, roots, templates]);
	const selectedRoot = roots[rootIndex];

	return (
		<Box flexDirection="row" width="100%" height="100%">
			<Box
				flexDirection="column"
				flexGrow={1}
				paddingRight={1}
				overflow="hidden"
			>
				{loading && <Text color="gray">Loading SOAP projection...</Text>}
				{error && <Text color="red">{error}</Text>}
				{!loading && !document && !error && (
					<Text color="gray">No clinical document projection available.</Text>
				)}
				{document &&
					SECTIONS.map((section) => (
						<Box key={section} flexDirection="column" marginBottom={1}>
							<Text bold color="cyan">
								{section.toUpperCase()}
							</Text>
							{(renderedSections[section].length
								? renderedSections[section]
								: ["No content"]
							).map((line, index) => (
								<Text key={`${section}-${index}`} wrap="truncate-end">
									{" "}
									{line}
								</Text>
							))}
						</Box>
					))}
				<Text dimColor>
					{previewRootId === confirmedRootId ? "CONFIRMED" : "PREVIEW"} |{" "}
					{message}
				</Text>
			</Box>
		</Box>
	);
}
