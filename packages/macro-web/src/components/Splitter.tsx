import { useCallback, useRef } from "react";
import { useI18n } from "../lib/macro-i18n-provider";

export interface SplitterProps {
	readonly orientation: "vertical" | "horizontal";
	readonly region: "domain" | "sidebar" | "inspector";
	readonly label: string;
	/** Current size as a fractional (fr) value. */
	readonly value: number;
	readonly min: number;
	readonly max: number;
	readonly step: number;
	/** Sum of all sibling fr values, used to convert pointer deltas to fr. */
	readonly totalFr: number;
	readonly onChange: (next: number) => void;
	/** Container used only during an active drag to scale pointer movement. */
	readonly containerRef?: React.RefObject<HTMLElement | null>;
}

const clamp = (value: number, min: number, max: number): number =>
	Math.max(min, Math.min(max, value));

/**
 * Accessible separator. CSS grid/flex owns the actual geometry; this component
 * only reports a new semantic ratio to the canonical layout owner. It supports
 * pointer dragging, keyboard arrows, Home, and End, and keeps focus on the
 * separator during keyboard resizing.
 */
export function Splitter({
	orientation,
	region,
	label,
	value,
	min,
	max,
	step,
	totalFr,
	onChange,
	containerRef,
}: SplitterProps) {
	const { t } = useI18n();
	const dragRef = useRef<{
		startX: number;
		startY: number;
		startValue: number;
		containerSize: number;
		totalFr: number;
	} | null>(null);
	const now = Math.round(value * 100);
	const minPercent = Math.round(min * 100);
	const maxPercent = Math.round(max * 100);

	const commit = useCallback(
		(next: number) => onChange(clamp(next, min, max)),
		[onChange, min, max],
	);

	const onKeyDown = useCallback(
		(event: React.KeyboardEvent) => {
			if (orientation !== "vertical") return;
			if (event.key === "ArrowLeft") {
				event.preventDefault();
				commit(value - step);
			} else if (event.key === "ArrowRight") {
				event.preventDefault();
				commit(value + step);
			} else if (event.key === "Home") {
				event.preventDefault();
				commit(min);
			} else if (event.key === "End") {
				event.preventDefault();
				commit(max);
			}
		},
		[orientation, value, step, commit, min, max],
	);

	const onPointerDown = useCallback(
		(event: React.PointerEvent) => {
			event.preventDefault();
			const container = containerRef?.current;
			const bounds = container?.getBoundingClientRect();
			const computedTotalFr = Number.parseFloat(
				container
					? getComputedStyle(container).getPropertyValue("--workbench-total-fr")
					: "",
			);
			const activeTotalFr = Number.isFinite(computedTotalFr)
				? computedTotalFr
				: totalFr;
			const containerSize =
				orientation === "vertical"
					? (bounds?.width ?? 1)
					: (bounds?.height ?? 1);
			dragRef.current = {
				startX: event.clientX,
				startY: event.clientY,
				startValue: value,
				containerSize,
				totalFr: activeTotalFr,
			};
			event.currentTarget.setPointerCapture(event.pointerId);
		},
		[containerRef, value],
	);

	const onPointerMove = useCallback(
		(event: React.PointerEvent) => {
			const drag = dragRef.current;
			if (!drag) return;
			const deltaPx =
				orientation === "vertical"
					? event.clientX - drag.startX
					: event.clientY - drag.startY;
			const frDelta = (deltaPx * drag.totalFr) / drag.containerSize;
			commit(drag.startValue + frDelta);
		},
		[totalFr, commit],
	);

	const onPointerUp = useCallback((event: React.PointerEvent) => {
		dragRef.current = null;
		if (event.currentTarget.hasPointerCapture(event.pointerId)) {
			event.currentTarget.releasePointerCapture(event.pointerId);
		}
	}, []);

	return (
		<hr
			aria-orientation={orientation}
			aria-label={label}
			aria-valuemin={minPercent}
			aria-valuemax={maxPercent}
			aria-valuenow={now}
			aria-valuetext={t("workbench.splitterValue", { value: now })}
			tabIndex={0}
			className={`splitter splitter-${orientation}`}
			data-region={region}
			onKeyDown={onKeyDown}
			onPointerDown={onPointerDown}
			onPointerMove={onPointerMove}
			onPointerUp={onPointerUp}
		/>
	);
}
