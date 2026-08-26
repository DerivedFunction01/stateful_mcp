import type {
	CadenceSchedule,
	CadenceScheduleResolution,
	CadenceType,
	FrequencyConsumerPolicy,
	FrequencyDiagnostic,
} from "./types";

/**
 * Validates a resolved cadence schedule against a consumer policy, accumulating
 * diagnostics for any disallowed cadence types, anchors, or units, and returns
 * the final resolution envelope.
 */
export function validateAndResolve<
	TAnchor extends string,
	TUnit extends string,
>(
	schedule: CadenceSchedule<TAnchor, TUnit>,
	policy: FrequencyConsumerPolicy<TAnchor, TUnit>,
	diagnostics: FrequencyDiagnostic[],
): CadenceScheduleResolution<TAnchor, TUnit> {
	if (
		policy.allowedCadenceTypes &&
		!policy.allowedCadenceTypes.includes(schedule.cadenceType as CadenceType)
	) {
		diagnostics.push({
			code: "cadence_type_not_allowed",
			messageKey: "errors.frequencyCadenceTypeNotAllowed",
			messageParams: { cadenceType: schedule.cadenceType },
		});
	}

	if (schedule.eventAnchor && policy.allowedAnchors) {
		if (!policy.allowedAnchors.includes(schedule.eventAnchor)) {
			diagnostics.push({
				code: "invalid_event_anchor",
				messageKey: "errors.frequencyEventAnchorNotAllowed",
				messageParams: { eventAnchor: schedule.eventAnchor },
			});
		}
	}

	if (schedule.interval?.unit && policy.allowedUnits) {
		if (!policy.allowedUnits.includes(schedule.interval.unit)) {
			diagnostics.push({
				code: "invalid_time_unit",
				messageKey: "errors.frequencyTimeUnitNotAllowed",
				messageParams: { unit: schedule.interval.unit },
			});
		}
	}

	if (schedule.recurrence?.period && policy.allowedUnits) {
		if (!policy.allowedUnits.includes(schedule.recurrence.period)) {
			diagnostics.push({
				code: "invalid_time_unit",
				messageKey: "errors.frequencyTimeUnitNotAllowed",
				messageParams: { unit: schedule.recurrence.period },
			});
		}
	}

	return {
		value: diagnostics.length === 0 ? schedule : undefined,
		diagnostics,
	};
}
