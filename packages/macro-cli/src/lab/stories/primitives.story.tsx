import type { TuiStory } from "../story-contract";
import { TuiBadge } from "../../ui/primitives/TuiBadge";
import { TuiButton } from "../../ui/primitives/TuiButton";
import { TuiDivider } from "../../ui/primitives/TuiDivider";
import { TuiFrame } from "../../ui/primitives/TuiFrame";
import { TuiList, type TuiListItem } from "../../ui/primitives/TuiList";
import { TuiPanel } from "../../ui/primitives/TuiPanel";
import { TuiTree, type TuiTreeNode } from "../../ui/primitives/TuiTree";

const LIST_ITEMS: readonly TuiListItem[] = [
	{ id: "1", title: "Initialize workspace", meta: "0.2ms", shortcut: "enter" },
	{ id: "2", title: "Compile macro definitions", meta: "1.4ms" },
	{ id: "3", title: "Validate syntax tokens", meta: "0.8ms" },
];

const TREE_NODES: readonly TuiTreeNode[] = [
	{
		id: "root-1",
		label: "Session Root (session-alpha)",
		variant: "accent",
		children: [
			{ id: "c1", label: "Cell 1: ^echo message=\"hi\"", variant: "supporting", meta: "[valid]" },
			{ id: "c2", label: "Cell 2: ^deploy env=staging", variant: "supporting", meta: "[valid]" },
			{ id: "c3", label: "Cell 3: raw text", variant: "refuting", meta: "[syntax-error]" },
		],
	},
];

export const primitivesStory: TuiStory = {
	id: "primitives",
	title: "Design System Primitives",
	category: "Primitives",
	states: ["buttons-and-badges", "frames-and-panels", "lists-and-trees"],
	render(context) {
		const width = Math.min(60, context.size.columns - 4);

		if (context.stateId === "buttons-and-badges") {
			return (
				<TuiFrame title="Buttons & Badges" width={width} showBounds={context.showBounds}>
					<box flexDirection="column" padding={1}>
						<box flexDirection="row" marginBottom={1}>
							<TuiBadge label="NORMAL" variant="success" bold bracketed />
							<text> </text>
							<TuiBadge label="INSERT" variant="warning" bold bracketed />
							<text> </text>
							<TuiBadge label="ERROR" variant="error" bold bracketed />
							<text> </text>
							<TuiBadge label="TAG" variant="info" />
						</box>
						<TuiDivider label="Interactive Buttons" />
						<box flexDirection="row" marginTop={1}>
							<TuiButton label="Submit" isFocused={true} shortcut="Enter" />
							<text> </text>
							<TuiButton label="Cancel" shortcut="Esc" />
							<text> </text>
							<TuiButton label="Disabled" disabled={true} />
						</box>
					</box>
				</TuiFrame>
			);
		}

		if (context.stateId === "lists-and-trees") {
			return (
				<TuiFrame title="Lists & Trees" width={width} showBounds={context.showBounds}>
					<box flexDirection="column" padding={1}>
						<TuiList items={LIST_ITEMS} selectedIndex={0} />
						<box marginTop={1} marginBottom={1}>
							<TuiDivider label="Tree Hierarchy" />
						</box>
						<TuiTree nodes={TREE_NODES} />
					</box>
				</TuiFrame>
			);
		}

		return (
			<TuiPanel title="Panel Component" subtitle="v1.0" headerRight={<TuiBadge label="Active" variant="success" />}>
				<TuiFrame title="Inner Frame" width={width} showBounds={context.showBounds}>
					<box padding={1}>
						<TuiDivider label="Section 1" />
					</box>
				</TuiFrame>
			</TuiPanel>
		);
	},
};
