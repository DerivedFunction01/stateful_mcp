import type { CadenceSchedule } from "./types";

/**
 * Formats a structured CadenceSchedule back into a standardized human-readable string.
 */
export function formatCadenceSchedule<
	TAnchor extends string = string,
	TUnit extends string = string,
>(schedule: CadenceSchedule<TAnchor, TUnit>): string {
	const parts: string[] = [];

	switch (schedule.cadenceType) {
		case "interval": {
			if (schedule.interval) {
				const range =
					schedule.interval.upperMultiplier !== undefined
						? `${schedule.interval.multiplier}-${schedule.interval.upperMultiplier}`
						: `${schedule.interval.multiplier}`;
				const unit =
					schedule.interval.multiplier === 1 &&
					schedule.interval.upperMultiplier === undefined
						? schedule.interval.unit
						: `${schedule.interval.unit}s`;
				parts.push(`every ${range} ${unit}`);
			}
			break;
		}
		case "recurrence": {
			if (schedule.recurrence) {
				const countStr =
					schedule.recurrence.count === 1
						? "once"
						: schedule.recurrence.count === 2
							? "twice"
							: `${schedule.recurrence.count} times`;
				parts.push(`${countStr} a ${schedule.recurrence.period}`);
			}
			break;
		}
		case "event_anchored": {
			if (schedule.relativeOffset?.duration) {
				const dur = schedule.relativeOffset.duration;
				parts.push(
					`${dur.magnitude} ${dur.unit}${dur.magnitude > 1 ? "s" : ""} ${schedule.relativeOffset.direction} ${schedule.eventAnchor?.replace(/_/g, " ")}`,
				);
			} else if (schedule.eventAnchor) {
				parts.push(`at ${schedule.eventAnchor.replace(/_/g, " ")}`);
			}
			break;
		}
		case "continuous": {
			parts.push("continuously");
			break;
		}
		case "one_time": {
			if (!schedule.isConditional) {
				parts.push("once");
			}
			break;
		}
	}

	if (schedule.isConditional) {
		parts.push("as needed");
		if (schedule.condition) {
			parts.push(`for ${schedule.condition}`);
		}
	}

	return parts.join(" ").trim();
}
