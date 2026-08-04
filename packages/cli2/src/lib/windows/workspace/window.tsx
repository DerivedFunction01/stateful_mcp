import type { WorkspaceSnapshot } from "@stateful-mcp/clinical/workspaces/workspace-snapshot";
import { CommandBar } from "../../../components/CommandBar";
import { HelpBar } from "../../../components/HelpBar";
import { StatusBar } from "../../../components/StatusBar";
import { WorkspaceView } from "../../../components/WorkspaceView";
import type {
	CommandCatalog,
	EditorKernelState,
	WindowDefinition,
	WindowRegion,
} from "../../editor";
import type { WindowDomainPort } from "../notebook/domain";
import type { WorkspaceDocumentPort } from "./document";

export interface WorkspaceWindowDeps {
	document: WorkspaceDocumentPort;
	domain: WindowDomainPort;
	catalog: CommandCatalog;
	sessionId: string;
	editorState: EditorKernelState;
	snapshot: WorkspaceSnapshot | null;
	loading: boolean;
	error: string | null;
	focused: boolean;
	lastEditCellId: string | null;
	dirty?: boolean;
}

/**
 *  workspace window definition. Hosted by the same `WindowContainer` as the
 * notebook: the container owns the single `useInput`, and this definition only
 * supplies the window's regions (primary cell list, scoped command bar, status
 * with branch context, help footer, and a reserved sidebar). Editing uses the
 * shared cell document surface; the command bar is scoped to workspace/variable
 * commands only.
 */
export function workspaceWindow(deps: WorkspaceWindowDeps): WindowDefinition {
	return {
		type: "workspace",
		regions: () => {
			const view = deps.document.getView();
			const mode = view.selection ? "VISUAL" : deps.editorState.mode;
			const context = {
				hostKind: "workspace",
				collection: {
					kind: "workspace",
					collectionId: deps.snapshot?.workspaceId ?? deps.sessionId,
				},
				sessionId: deps.sessionId,
				activeBranchId: deps.snapshot?.activeBranchId ?? undefined,
			};
			const regions: WindowRegion[] = [];

			regions.push({
				slot: "primary",
				key: "workspace-primary",
				render() {
					return (
						<WorkspaceView
							snapshot={deps.snapshot}
							loading={deps.loading}
							error={deps.error}
							focused={deps.focused}
						/>
					);
				},
			});

			if (mode === "COMMAND") {
				const commandLine = deps.editorState.draftText;
				const suggestions = deps.catalog.getSuggestions(
					commandLine.slice(1),
					context,
				);
				const highlightedCandidate =
					deps.editorState.completion.status === "cycling"
						? (deps.editorState.completion.candidates[
								deps.editorState.completion.highlightIndex
							] ?? null)
						: null;
				const completionPrefix =
					deps.editorState.completion.status === "cycling"
						? deps.editorState.completion.session.prefix
						: commandLine.slice(1);

				regions.push({
					slot: "command",
					key: "workspace-command-prompt",
					render() {
						return (
							<CommandBar
								commandLine={commandLine}
								suggestions={suggestions}
								suggestionIndex={
									deps.editorState.completion.status === "cycling"
										? deps.editorState.completion.highlightIndex
										: -1
								}
								highlightedCandidate={highlightedCandidate}
								completionPrefix={completionPrefix}
							/>
						);
					},
				});
			}

			regions.push({
				slot: "footer",
				key: "workspace-help-bar",
				render() {
					const editorDescriptors = deps.catalog.getDescriptors(context);
					return <HelpBar mode={mode} editorDescriptors={editorDescriptors} />;
				},
			});

			regions.push({
				slot: "status",
				key: "workspace-status-bar",
				render() {
					return (
						<StatusBar
							mode={mode}
							cellCount={view.cells.length}
							activeIndex={view.activeIndex}
							sessionId={deps.sessionId}
							dirty={deps.dirty ?? false}
							sessionMode="execute"
							message={null}
							visualStart={view.selection?.start ?? 0}
							visualEnd={view.selection?.end ?? 0}
							defaultSection="assessment"
							defaultSchema={null}
						/>
					);
				},
			});

			// Reserved sidebar slot: branch/evidence tree projection. Content is
			// deferred beyond P5; registering the region requires no container change.
			regions.push({
				slot: "sidebar",
				key: "workspace-sidebar",
				render: () => null,
			});

			return regions;
		},
	};
}
