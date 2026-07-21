import { z } from "zod";
import type { PaginationLimitsConfig } from "./types";

// Per-surface defaults and hard ceilings
const SURFACES = {
  log_page_size:             { default: 20,  ceiling: 200  },
  examples_page_size:        { default: 5,   ceiling: 50   },
  merge_conflicts_page_size: { default: 50,  ceiling: 500  },
  trace_query_page_size:     { default: 10,  ceiling: 100  },
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

/**
 * Returns the effective maximum to advertise in a Zod schema (.max() / JSON Schema "maximum").
 * This is the operator-configured default capped at the hard ceiling — i.e. the largest value
 * a caller may request on this surface given the current configuration.
 */
export function getMax(key: LimitKey, cfg: PaginationLimitsConfig | undefined): number {
  return clampLimit(undefined, key, cfg);
}

/**
 * Builds a Zod field for a caller-supplied `limit`, advertising the
 * operator-configured maximum as a JSON-Schema-style bound (min/max) the way
 * OpenAI function schemas do. The bounds are derived entirely from config at
 * registration time — the default/ceiling numbers are never hardcoded into a
 * description string, so changing `pagination_limits` in config is reflected
 * automatically without touching service code.
 */
export function buildLimitField(key: LimitKey, cfg: PaginationLimitsConfig | undefined) {
  const max = getMax(key, cfg);
  return z
    .number()
    .int()
    .min(1)
    .max(max)
    .optional()
    .describe(
      `Maximum number of items to return per page.`
    );
}
