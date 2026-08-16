import { TextAttributes } from "@opentui/core";
import { TuiGlyphs, TuiNamedColors } from "../tokens";

export interface TuiTreeNode {
	readonly id: string;
	readonly label: string;
	readonly variant?: "default" | "supporting" | "refuting" | "dim" | "accent";
	readonly meta?: string;
	readonly children?: readonly TuiTreeNode[];
}

export interface TuiTreeProps {
	readonly nodes: readonly TuiTreeNode[];
	readonly depth?: number;
	readonly prefix?: string;
	readonly isLast?: boolean;
}

export function TuiTree({
	nodes,
	depth = 0,
	prefix = "",
}: TuiTreeProps) {
	return (
		<box flexDirection="column">
			{nodes.map((node, index) => {
				const isLastChild = index === nodes.length - 1;
				const branch = depth === 0
					? ""
					: isLastChild
						? TuiGlyphs.connectors.treeLast
						: TuiGlyphs.connectors.treeBranch;

				let fg: string = TuiNamedColors.primary;
				let attributes = 0;

				switch (node.variant) {
					case "supporting":
						fg = TuiNamedColors.success;
						break;
					case "refuting":
						fg = TuiNamedColors.error;
						break;
					case "accent":
						fg = TuiNamedColors.accent;
						attributes = TextAttributes.BOLD;
						break;
					case "dim":
						fg = TuiNamedColors.muted;
						attributes = TextAttributes.DIM;
						break;
					default:
						fg = TuiNamedColors.primary;
						break;
				}

				const nextPrefix = depth === 0
					? ""
					: prefix + (isLastChild ? "    " : TuiGlyphs.connectors.treeVertical);

				return (
					<box key={node.id} flexDirection="column">
						<box flexDirection="row" height={1}>
							{depth > 0 && (
								<text fg={TuiNamedColors.border}>
									{prefix}{branch}
								</text>
							)}
							<text fg={fg} attributes={attributes}>
								{node.label}
							</text>
							{node.meta && (
								<text fg={TuiNamedColors.muted} attributes={TextAttributes.DIM}>
									{"  "}{node.meta}
								</text>
							)}
						</box>
						{node.children && node.children.length > 0 && (
							<TuiTree
								nodes={node.children}
								depth={depth + 1}
								prefix={nextPrefix}
							/>
						)}
					</box>
				);
			})}
		</box>
	);
}
