import type { PaginationLimitsConfig } from "./types";

// Per-surface defaults and hard ceilings
const SURFACES = {
  log_page_size:             { default: 20,  ceiling: 200  },
  examples_page_size:        { default: 5,   ceiling: 50   },
  merge_conflicts_page_size: { default: 20,  ceiling: 200  },
} as const;

export type LimitKey = keyof typeof SURFACES;

/**
 * Clamp a caller-supplied limit to [1, ceiling].
 *
 * Resolution order:
 *   1. Start with the caller-requested value (if any).
 *   2. Fall back to the operator-configured default (pagination_limits field).
 *   3. Fall back to the built-in default.
 *   4. Never exceed the hard ceiling regardless of config or caller.
 */
export function clampLimit(
  requested: number | undefined,
  key: LimitKey,
  cfg: PaginationLimitsConfig | undefined
): number {
  const { default: builtInDefault, ceiling } = SURFACES[key];
  // Config-supplied default is itself capped at the ceiling so operators can't
  // accidentally set a default higher than the hard ceiling.
  const configuredDefault = Math.min(cfg?.[key] ?? builtInDefault, ceiling);
  const base = requested !== undefined
    ? Math.min(Math.max(1, Math.floor(requested)), ceiling)
    : configuredDefault;
  return base;
}
