import { spawn, ChildProcess } from "child_process";
import * as path from "path";
import * as fs from "fs";
import type { QueryDefinition, FilterCondition } from "../../middleware/filter/types";
import type { QueryEngine } from "./interfaces";
import { registerAdapter } from "../../config/loader";

export class DataFrameQueryEngine implements QueryEngine {
  public supportedOpFamilies = ["comparison", "set", "sort", "aggregation"];
  public supportedOperations = [
    "eq", "neq", "gt", "geq", "lt", "leq", "like", "not_like",
    "in_set", "not_in_set", "between", "not_between"
  ];

  private pyProcess!: ChildProcess;
  private pendingResolvers = new Map<number, (val: any) => void>();
  private pendingRejecters = new Map<number, (err: any) => void>();
  private messageCounter = 0;
  private isBridgeReady = false;
  private bridgeReadyPromise: Promise<void>;

  constructor(
    private sourceFile: string,
    private dataframeName: string,
    private pythonPath: string = "python3"
  ) {
    this.bridgeReadyPromise = this.startBridge();
  }

  private startBridge(): Promise<void> {
    return new Promise((resolve, reject) => {
      const scriptPath = path.resolve(__dirname, "dataframe-bridge.py");
      this.pyProcess = spawn(this.pythonPath, [scriptPath]);

      let buffer = "";

      this.pyProcess.stdout?.on("data", (data) => {
        buffer += data.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const res = JSON.parse(line);
            if (res.pong) {
              this.isBridgeReady = true;
              resolve();
              continue;
            }

            const id = res.id;
            if (id !== undefined) {
              if (res.success) {
                const resolver = this.pendingResolvers.get(id);
                if (resolver) {
                  resolver(res.data ?? res);
                  this.pendingResolvers.delete(id);
                  this.pendingRejecters.delete(id);
                }
              } else {
                const rejecter = this.pendingRejecters.get(id);
                if (rejecter) {
                  rejecter(new Error(res.error || "Execution failed"));
                  this.pendingResolvers.delete(id);
                  this.pendingRejecters.delete(id);
                }
              }
            }
          } catch (_) {}
        }
      });

      this.pyProcess.stderr?.on("data", (data) => {
        const msg = data.toString().trim();
        console.error(`Python Stderr: ${msg}`);
        if (msg.includes("Missing 'pandas' or 'duckdb'")) {
          reject(new Error(msg));
        }
      });

      this.pyProcess.on("error", (err) => {
        console.error("Python Spawn Error:", err);
        reject(err);
      });

      this.pyProcess.on("close", (code) => {
        reject(new Error(`Python bridge closed with code ${code}`));
      });

      // Send a ping to verify readiness
      this.pyProcess.stdin?.write(JSON.stringify({ action: "ping" }) + "\n");
    });
  }

  private async sendCommand(cmd: any): Promise<any> {
    await this.bridgeReadyPromise;
    return new Promise((resolve, reject) => {
      const id = this.messageCounter++;
      this.pendingResolvers.set(id, resolve);
      this.pendingRejecters.set(id, reject);
      this.pyProcess.stdin?.write(JSON.stringify({ ...cmd, id }) + "\n");
    });
  }

  public async loadDataFrame(): Promise<void> {
    const res = await this.sendCommand({
      action: "load",
      source_file: this.sourceFile,
      dataframe_name: this.dataframeName
    });
    if (!res.success) {
      throw new Error(`Failed to load DataFrame: ${res.error}`);
    }
  }

  private compileCondition(cond: FilterCondition, params: any[]): string {
    const prop = `"${cond.property}"`;
    const val = cond.value;

    switch (cond.operator) {
      case "eq":
        params.push(val);
        return `${prop} = ?`;
      case "neq":
        params.push(val);
        return `${prop} != ?`;
      case "gt":
        params.push(val);
        return `${prop} > ?`;
      case "geq":
        params.push(val);
        return `${prop} >= ?`;
      case "lt":
        params.push(val);
        return `${prop} < ?`;
      case "leq":
        params.push(val);
        return `${prop} <= ?`;
      case "like": {
        const list = Array.isArray(val) ? val : [val];
        if (list.length === 0) return "1=0";
        const conds = list.map((item) => {
          params.push(item);
          return `${prop} LIKE ?`;
        });
        return `(${conds.join(" OR ")})`;
      }
      case "not_like": {
        const list = Array.isArray(val) ? val : [val];
        if (list.length === 0) return "1=1";
        const conds = list.map((item) => {
          params.push(item);
          return `${prop} NOT LIKE ?`;
        });
        return `(${conds.join(" AND ")})`;
      }
      case "in_set": {
        const list = Array.isArray(val) ? val : String(val).split(",").map(s => s.trim());
        list.forEach(v => params.push(v));
        const placeholders = list.map(() => "?").join(", ");
        return `${prop} IN (${placeholders})`;
      }
      case "not_in_set": {
        const list = Array.isArray(val) ? val : String(val).split(",").map(s => s.trim());
        list.forEach(v => params.push(v));
        const placeholders = list.map(() => "?").join(", ");
        return `${prop} NOT IN (${placeholders})`;
      }
      case "between":
        if (Array.isArray(val) && val.length === 2) {
          params.push(val[0], val[1]);
          return `${prop} BETWEEN ? AND ?`;
        }
        throw new Error("Operator 'between' requires a 2-element array.");
      case "not_between":
        if (Array.isArray(val) && val.length === 2) {
          params.push(val[0], val[1]);
          return `${prop} NOT BETWEEN ? AND ?`;
        }
        throw new Error("Operator 'not_between' requires a 2-element array.");
      default:
        throw new Error(`Unsupported SQL operator: ${cond.operator}`);
    }
  }

  public compile(tableName: string, query: QueryDefinition, params: any[] = []): { sql: string; params: unknown[] } {
    let selectClause = "*";
    if (query.aggregations && query.aggregations.length > 0) {
      const parts = query.aggregations.map((agg) => {
        if (agg.function === "count") return "COUNT(*)";
        return `${agg.function.toUpperCase()}("${agg.property}")`;
      });
      selectClause = parts.join(", ");
    }

    let sql = `SELECT ${selectClause} FROM "${tableName}"`;

    const whereParts: string[] = [];
    if (query.filters && query.filters.length > 0) {
      query.filters.forEach((c: FilterCondition) => {
        whereParts.push(this.compileCondition(c, params));
      });
    }

    if (whereParts.length > 0) {
      sql += ` WHERE ${whereParts.join(" AND ")}`;
    }

    if (query.sort && query.sort.length > 0) {
      const sortParts = query.sort.map((s) => `"${s.property}" ${s.direction.toUpperCase()}`);
      sql += ` ORDER BY ${sortParts.join(", ")}`;
    }

    if (query.limit !== undefined) {
      sql += ` LIMIT ${query.limit}`;
    }
    if (query.offset !== undefined) {
      sql += ` OFFSET ${query.offset}`;
    }

    return { sql, params };
  }

  async execute(tableName: string, query: QueryDefinition): Promise<unknown[]> {
    const params: any[] = [];
    const { sql, params: compiledParams } = this.compile(tableName, query, params);
    
    // Replace standard SQL positional question marks with sequential positional parameters supported by DuckDB query bridge
    let index = 0;
    const bridgeSql = sql.replace(/\?/g, () => `$${++index}`);

    const res = await this.sendCommand({
      action: "query",
      sql: bridgeSql,
      params: compiledParams
    });

    return res || [];
  }

  public destroy() {
    this.pyProcess.kill();
  }
}

// Register dataframe engine adapter
registerAdapter("dataframe", {
  create: async (options) => {
    const sourceFile = path.resolve(process.cwd(), String(options.source_file));
    const dataframeName = String(options.dataframe_name || "df");
    const pythonPath = String(options.python_path || "python3");
    const engine = new DataFrameQueryEngine(sourceFile, dataframeName, pythonPath);
    await engine.loadDataFrame();
    return engine;
  }
});
