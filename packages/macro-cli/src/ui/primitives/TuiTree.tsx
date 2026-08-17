import { TextAttributes } from "@opentui/core";
import { GlobalThemeRegistry, type TuiThemeDefinition } from "../theme";
import { TuiGlyphs } from "../tokens";

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
	readonly theme?: TuiThemeDefinition;
}

export function TuiTree({
	nodes,
	depth = 0,
	prefix = "",
	theme,
}: TuiTreeProps) {
	const c = (theme ?? GlobalThemeRegistry.getActive()).colors;

	return (
		<box flexDirection="column">
			{nodes.map((node, index) => {
				const isLastChild = index === nodes.length - 1;
				const branch =
					depth === 0
						? ""
						: isLastChild
							? TuiGlyphs.connectors.treeLast
							: TuiGlyphs.connectors.treeBranch;

				let fg: string = c.fgPrimary;
				let attributes = 0;

				switch (node.variant) {
					case "supporting":
						fg = c.statusSuccess;
						break;
					case "refuting":
						fg = c.statusError;
						break;
					case "accent":
						fg = c.accentPrimary;
						attributes = TextAttributes.BOLD;
						break;
					case "dim":
						fg = c.fgMuted;
						attributes = TextAttributes.DIM;
						break;
					default:
						fg = c.fgPrimary;
						break;
				}

				const nextPrefix =
					depth === 0
						? ""
						: prefix +
							(isLastChild ? "    " : TuiGlyphs.connectors.treeVertical);

				return (
					<box key={node.id} flexDirection="column">
						<box flexDirection="row" height={1}>
							<text fg={c.borderSubtle}>
								{prefix}
								{branch}
							</text>
							<text fg={fg} attributes={attributes}>
								{node.label}
							</text>
							{node.meta && (
								<text fg={c.fgDim} attributes={TextAttributes.DIM}>
									{"  "}
									{node.meta}
								</text>
							)}
						</box>
						{node.children && node.children.length > 0 && (
							<TuiTree
								nodes={node.children}
								depth={depth + 1}
								prefix={nextPrefix}
								theme={theme}
							/>
						)}
					</box>
				);
			})}
		</box>
	);
}
