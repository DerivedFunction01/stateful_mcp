import { useEffect, useState } from "react";

/**
 * Reusable terminal cursor blinking hook.
 * Standard terminal cursor blink cycle is ~530ms.
 */
export function useCursorBlink(intervalMs = 530, active = true): boolean {
	const [visible, setVisible] = useState(true);

	useEffect(() => {
		if (!active) {
			setVisible(true);
			return;
		}
		const timer = setInterval(() => {
			setVisible((prev) => !prev);
		}, intervalMs);
		return () => clearInterval(timer);
	}, [intervalMs, active]);

	return visible;
}
