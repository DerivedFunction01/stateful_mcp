// Ambient declarations so `tsc` can emit types for Bun-only imports that have
// no bundled type definitions. Runtime resolution is handled by the Bun build step.
declare module "bun:sqlite" {
  export class Database {
    constructor(path: string, options?: unknown);
    query<T = unknown>(sql: string): { all(...params: unknown[]): T[]; get(...params: unknown[]): T | null; run(...params: unknown[]): unknown };
    run(sql: string, ...params: unknown): unknown;
    transaction<T extends (...args: any[]) => unknown>(fn: T): T;
    close(): void;
  }
}
