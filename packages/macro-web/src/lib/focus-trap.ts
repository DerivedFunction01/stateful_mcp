export function trapFocus(
	event: React.KeyboardEvent,
	container: HTMLElement | null,
): void {
	if (event.key !== "Tab" || !container) return;
	const focusable = Array.from(
		container.querySelectorAll<HTMLElement>(
			'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
		),
	);
	if (focusable.length === 0) {
		event.preventDefault();
		container.focus();
		return;
	}
	const first = focusable[0]!;
	const last = focusable[focusable.length - 1]!;
	const active = document.activeElement;
	if (event.shiftKey && (active === first || active === container)) {
		event.preventDefault();
		last.focus();
	} else if (!event.shiftKey && active === last) {
		event.preventDefault();
		first.focus();
	}
}
