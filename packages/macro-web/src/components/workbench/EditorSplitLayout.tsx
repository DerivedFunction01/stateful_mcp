import type {
	EditorLayoutNodeDto,
	EditorLayoutSplitDto,
	WorkspaceSnapshot,
} from "@stateful-mcp/macro-protocol";
import {
	Fragment,
	type ReactNode,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";

export function flattenEditorLayout(
	node: NonNullable<WorkspaceSnapshot["editor"]["editorLayout"]>["root"],
): string[] {
	return node.kind === "group"
		? [node.groupId]
		: node.children.flatMap((child) => flattenEditorLayout(child));
}

function EditorSplitDivider({
	orientation,
	index,
	childrenCount,
	currentRatios,
	onResize,
}: {
	readonly orientation: "horizontal" | "vertical";
	readonly index: number;
	readonly childrenCount: number;
	readonly currentRatios: readonly number[];
	readonly onResize: (ratios: readonly number[]) => void;
}) {
	const dividerRef = useRef<HTMLDivElement | null>(null);
	const dragRef = useRef<{
		startPos: number;
		containerSize: number;
		leftRatio: number;
		rightRatio: number;
		ratiosSnapshot: readonly number[];
	} | null>(null);

	const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
		event.preventDefault();
		event.stopPropagation();
		const parent = dividerRef.current?.parentElement;
		if (!parent) return;
		const rect = parent.getBoundingClientRect();
		const containerSize = orientation === "vertical" ? rect.width : rect.height;
		const leftRatio = currentRatios[index] ?? 1 / childrenCount;
		const rightRatio = currentRatios[index + 1] ?? 1 / childrenCount;
		dragRef.current = {
			startPos: orientation === "vertical" ? event.clientX : event.clientY,
			containerSize: Math.max(containerSize, 1),
			leftRatio,
			rightRatio,
			ratiosSnapshot: currentRatios,
		};
		event.currentTarget.setPointerCapture(event.pointerId);
	};

	const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
		const drag = dragRef.current;
		if (!drag) return;
		const currentPos =
			orientation === "vertical" ? event.clientX : event.clientY;
		const deltaPx = currentPos - drag.startPos;
		const deltaRatio = deltaPx / drag.containerSize;
		const sumRatios = drag.leftRatio + drag.rightRatio;
		const minRatio = 0.05;
		const nextLeft = Math.max(
			minRatio,
			Math.min(sumRatios - minRatio, drag.leftRatio + deltaRatio),
		);
		const nextRight = sumRatios - nextLeft;

		const nextRatios = [...drag.ratiosSnapshot];
		nextRatios[index] = nextLeft;
		nextRatios[index + 1] = nextRight;
		onResize(nextRatios);
	};

	const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
		dragRef.current = null;
		if (event.currentTarget.hasPointerCapture(event.pointerId)) {
			event.currentTarget.releasePointerCapture(event.pointerId);
		}
	};

	const handleDoubleClick = (event: React.MouseEvent) => {
		event.preventDefault();
		event.stopPropagation();
		const equalRatio = 1 / childrenCount;
		const nextRatios = Array(childrenCount).fill(equalRatio);
		onResize(nextRatios);
	};

	return (
		<div
			ref={dividerRef}
			className={`editor-splitter editor-splitter--${orientation}`}
			onPointerDown={handlePointerDown}
			onPointerMove={handlePointerMove}
			onPointerUp={handlePointerUp}
			onDoubleClick={handleDoubleClick}
		/>
	);
}

function EditorSplitBranch({
	node,
	groups,
	onResize,
}: {
	readonly node: EditorLayoutSplitDto;
	readonly groups: ReadonlyMap<string, ReactNode>;
	readonly onResize: (nodeId: string, ratios: readonly number[]) => void;
}) {
	const childrenCount = node.children.length;
	const serverRatios = useMemo(
		() =>
			node.sizeRatios && node.sizeRatios.length === childrenCount
				? node.sizeRatios
				: Array(childrenCount).fill(1 / childrenCount),
		[node.sizeRatios, childrenCount],
	);

	const [localRatios, setLocalRatios] =
		useState<readonly number[]>(serverRatios);

	useEffect(() => {
		setLocalRatios(serverRatios);
	}, [serverRatios]);

	const handleLocalResize = (nextRatios: readonly number[]) => {
		setLocalRatios(nextRatios);
		onResize(node.nodeId, nextRatios);
	};

	return (
		<div
			className={`editor-split-container editor-split-container--${node.orientation}`}
			data-layout-node-id={node.nodeId}
			style={{
				display: "flex",
				flexDirection: node.orientation === "vertical" ? "row" : "column",
				flex: 1,
				width: "100%",
				height: "100%",
			}}
		>
			{node.children.map((child, index) => (
				<Fragment key={child.kind === "group" ? child.groupId : child.nodeId}>
					<div
						style={{
							flex: `${localRatios[index] ?? 1} 1 0%`,
							display: "flex",
							flexDirection: "column",
							minWidth: 0,
							minHeight: 0,
							width: "100%",
							height: "100%",
							overflow: "hidden",
						}}
					>
						{renderEditorLayout(child, groups, onResize)}
					</div>
					{index < childrenCount - 1 && (
						<EditorSplitDivider
							orientation={node.orientation}
							index={index}
							childrenCount={childrenCount}
							currentRatios={localRatios}
							onResize={handleLocalResize}
						/>
					)}
				</Fragment>
			))}
		</div>
	);
}

export function renderEditorLayout(
	node: EditorLayoutNodeDto,
	groups: ReadonlyMap<string, ReactNode>,
	onResize: (nodeId: string, ratios: readonly number[]) => void,
): ReactNode {
	if (node.kind === "group") return groups.get(node.groupId) ?? null;
	return <EditorSplitBranch node={node} groups={groups} onResize={onResize} />;
}
