import * as fs from "fs/promises";
import * as path from "path";
import type { ResourceLocator, MiddlewareConfig } from "./types";

// ── Env substitution ──────────────────────────────────────────────────────────

export async function loadEnvSources(
  sources: Array<{ _type: string; path?: string; optional?: boolean }>
): Promise<void> {
  // Load each .env file in order; process.env always wins over file values
  for (const src of sources) {
    if (src._type !== "file" || !src.path) continue;
    try {
      const raw = await fs.readFile(src.path, "utf-8");
      for (const line of raw.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq === -1) continue;
        const key = trimmed.slice(0, eq).trim();
        const val = trimmed.slice(eq + 1).trim();
        if (!(key in process.env)) process.env[key] = val;  // file never overrides real env
      }
    } catch (err) {
      if (!src.optional) throw new Error(`Required env file not found: ${src.path}`);
    }
  }
}

export function substituteEnvVars(obj: unknown): unknown {
  // Recursively walk any JSON-serializable value and replace "env:VAR_NAME" strings
  if (typeof obj === "string" && obj.startsWith("env:")) {
    const key = obj.slice(4);
    const val = process.env[key];
    if (val === undefined) throw new Error(`Missing env variable: ${key}`);
    return val;
  }
  if (Array.isArray(obj)) return obj.map(substituteEnvVars);
  if (obj && typeof obj === "object") {
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [k, substituteEnvVars(v)])
    );
  }
  return obj;
}

// ── Source resolution with TTL cache ─────────────────────────────────────────

interface CacheEntry { value: unknown; resolvedAt: number }
const sourceCache = new Map<string, CacheEntry>();

export async function resolveSource(
  locator: ResourceLocator,
  workspaceRoot: string,
  userId?: string    // supplied for user-scoped constants only
): Promise<unknown> {
  // Build cache key — include userId for user-scoped sources
  const cacheKey = JSON.stringify(locator) + (userId ? `:${userId}` : "");
  const ttl = locator._type !== "adapter" ? (locator.ttl_ms ?? 0) : 0;

  if (ttl === 0) {
    // Cache forever — serve from cache if present
    const cached = sourceCache.get(cacheKey);
    if (cached) return cached.value;
  } else {
    const cached = sourceCache.get(cacheKey);
    if (cached && Date.now() - cached.resolvedAt < ttl) return cached.value;
  }

  let value: unknown;

  switch (locator._type) {
    case "adapter":
      // Adapter resolution is not cached here — the registry handles adapter lifecycle
      return resolveAdapter(locator.name, substituteEnvVars(locator.options ?? {}) as Record<string, unknown>);

    case "file": {
      const resolved = path.resolve(workspaceRoot, locator.path);
      const raw = await fs.readFile(resolved, "utf-8");
      value = substituteEnvVars(JSON.parse(raw));
      break;
    }

    case "remote_url": {
      // Substitute {userId} placeholder in URL for user-scoped constants
      const url = userId ? locator.url.replace("{userId}", encodeURIComponent(userId)) : locator.url;
      const res = await fetch(url, { headers: locator.headers });
      if (!res.ok) throw new Error(`resolveSource fetch failed: ${url} → HTTP ${res.status}`);
      value = substituteEnvVars(await res.json());
      break;
    }

    default:
      throw new Error(`Unknown ResourceLocator _type: ${(locator as any)._type}`);
  }

  sourceCache.set(cacheKey, { value, resolvedAt: Date.now() });
  return value;
}

// ── Adapter registry (defined here to avoid circular import) ─────────────────

export interface AdapterFactory<T> {
  create(options: Record<string, unknown>): Promise<T>;
}

const registry = new Map<string, AdapterFactory<unknown>>();

export function registerAdapter<T>(name: string, factory: AdapterFactory<T>): void {
  if (registry.has(name)) throw new Error(`Adapter already registered: "${name}"`);
  registry.set(name, factory as AdapterFactory<unknown>);
}

export async function resolveAdapter<T>(
  name: string,
  options: Record<string, unknown> = {}
): Promise<T> {
  const factory = registry.get(name);
  if (!factory) throw new Error(`Unregistered adapter: "${name}"`);
  return factory.create(options) as Promise<T>;
}

export function clearCache(): void {
  sourceCache.clear();
}

/**
 * Loads the middleware configuration by reading and merging tools and storage configs.
 */
export async function loadMiddlewareConfig(workspaceRoot: string): Promise<MiddlewareConfig> {
  // Try loading split configs if they exist, or fallback to filter.config.json / config.json
  const toolsPath = path.join(workspaceRoot, "config", "tools.config.json");
  const storagePath = path.join(workspaceRoot, "config", "storage.config.json");
  
  let toolsConfig: any = {};
  let storageConfig: any = {};

  try {
    const rawTools = await fs.readFile(toolsPath, "utf-8");
    toolsConfig = JSON.parse(rawTools);
  } catch (e) {
    // If split doesn't exist, try reading single workspace config file
    const mainPath = path.join(workspaceRoot, "filter.config.json");
    try {
      const rawMain = await fs.readFile(mainPath, "utf-8");
      const parsedMain = JSON.parse(rawMain);
      return substituteEnvVars(parsedMain) as MiddlewareConfig;
    } catch (e2) {
      throw new Error(`Failed to find or parse configuration file in ${workspaceRoot}`);
    }
  }

  try {
    const rawStorage = await fs.readFile(storagePath, "utf-8");
    storageConfig = JSON.parse(rawStorage);
  } catch (e) {
    // Storage config is required if split layout is used
    throw new Error(`Storage configuration not found at ${storagePath}`);
  }

  const merged = {
    ...storageConfig,
    tools: toolsConfig.tools || toolsConfig,
  };

  return substituteEnvVars(merged) as MiddlewareConfig;
}
