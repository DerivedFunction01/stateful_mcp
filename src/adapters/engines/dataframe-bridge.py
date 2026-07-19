import sys
import json
import traceback

try:
    import pandas as pd
    import duckdb
except ImportError:
    # Print error to stderr so the TS process knows imports failed
    print("Error: Missing 'pandas' or 'duckdb' library.", file=sys.stderr)
    sys.exit(1)

# Keep references to loaded dataframes in local scope
dfs = {}

def handle_load(params):
    source_file = params.get("source_file")
    df_name = params.get("dataframe_name", "df")
    
    if not source_file:
        return {"success": False, "error": "Missing 'source_file' parameter"}

    try:
        if source_file.endswith(".csv"):
            df = pd.read_csv(source_file)
        elif source_file.endswith(".parquet"):
            df = pd.read_parquet(source_file)
        elif source_file.endswith(".json") or source_file.endswith(".jsonl"):
            df = pd.read_json(source_file, lines=source_file.endswith(".jsonl"))
        else:
            return {"success": False, "error": f"Unsupported file format: {source_file}"}
            
        dfs[df_name] = df
        # Register the DataFrame as a view in DuckDB
        duckdb.register(df_name, df)
        return {"success": True, "rows": len(df)}
    except Exception as e:
        return {"success": False, "error": str(e), "traceback": traceback.format_exc()}

def handle_query(params):
    sql = params.get("sql")
    params_list = params.get("params", [])
    if not sql:
        return {"success": False, "error": "Missing 'sql' parameter"}
        
    try:
        # Run DuckDB SQL query directly over the registered Pandas DataFrames
        res = duckdb.execute(sql, params_list).df()
        # Convert to records JSON representation
        records = res.to_dict(orient="records")
        # Handle nan/inf float serialization issues by converting to None
        cleaned = json.loads(json.dumps(records, default=str))
        return {"success": True, "data": cleaned}
    except Exception as e:
        return {"success": False, "error": str(e), "traceback": traceback.format_exc()}

def main():
    # Loop reading JSON commands from stdin
    while True:
        line = sys.stdin.readline()
        if not line:
            break
        if not line.strip():
            continue
        try:
            cmd = json.loads(line)
            action = cmd.get("action")
            
            if action == "load":
                res = handle_load(cmd)
            elif action == "query":
                res = handle_query(cmd)
            elif action == "ping":
                res = {"success": True, "pong": True}
            else:
                res = {"success": False, "error": f"Unknown action: {action}"}
                
            if "id" in cmd:
                res["id"] = cmd["id"]
                
            print(json.dumps(res))
            sys.stdout.flush()
        except Exception as e:
            err_res = {"success": False, "error": f"Malformed input: {str(e)}"}
            print(json.dumps(err_res))
            sys.stdout.flush()

if __name__ == "__main__":
    main()
