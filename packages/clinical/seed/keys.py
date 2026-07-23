import json
import argparse
from pathlib import Path

def print_top_level_keys(json_path: str) -> None:
    path = Path(json_path)
    if not path.exists():
        raise FileNotFoundError(f"File not found: {json_path}")

    with path.open(encoding="utf-8") as f:
        data = json.load(f)

    if not isinstance(data, dict):
        raise ValueError("Top-level JSON structure is not an object")

    for key in data.keys():
        print(key)

def main():
    parser = argparse.ArgumentParser(description="Print top-level keys of a JSON file")
    parser.add_argument("file", help="Path to the JSON file")
    args = parser.parse_args()

    print_top_level_keys(args.file)

if __name__ == "__main__":
    main()
