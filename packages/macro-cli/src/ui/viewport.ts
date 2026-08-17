export interface TuiViewportState {
	readonly offset: number;
	readonly viewportSize: number;
	readonly contentSize: number;
}

export function clampViewportOffset(
	offset: number,
	contentSize: number,
	viewportSize: number,
): number {
	const maxOffset = Math.max(
		0,
		Math.max(0, Math.floor(contentSize)) -
			Math.max(0, Math.floor(viewportSize)),
	);
	return Math.min(maxOffset, Math.max(0, Math.floor(offset)));
}

export function createViewport(
	contentSize: number,
	viewportSize: number,
	offset = 0,
): TuiViewportState {
	return {
		contentSize: Math.max(0, Math.floor(contentSize)),
		viewportSize: Math.max(0, Math.floor(viewportSize)),
		offset: clampViewportOffset(offset, contentSize, viewportSize),
	};
}

export function scrollViewport(
	viewport: TuiViewportState,
	delta: number,
): TuiViewportState {
	return createViewport(
		viewport.contentSize,
		viewport.viewportSize,
		viewport.offset + delta,
	);
}

export function revealViewportIndex(
	viewport: TuiViewportState,
	index: number,
): TuiViewportState {
	const target = Math.max(
		0,
		Math.min(viewport.contentSize - 1, Math.floor(index)),
	);
	let offset = viewport.offset;
	if (target < offset) offset = target;
	if (target >= offset + viewport.viewportSize) {
		offset = target - Math.max(0, viewport.viewportSize - 1);
	}
	return createViewport(viewport.contentSize, viewport.viewportSize, offset);
}
