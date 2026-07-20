#!/bin/bash
set -e

echo "Starting monorepo migration..."

# Ensure we are in the root directory
cd "$(dirname "$0")/.."

# 1. Create target package directories
mkdir -p packages/core/src
mkdir -p packages/mcp-transport/src/tools
mkdir -p packages/cli/src

# 2. Perform git mv moves to preserve Git history
echo "Moving files for packages/core..."
git mv src/adapters packages/core/src/
git mv src/errors packages/core/src/
git mv src/middleware packages/core/src/
git mv src/translation packages/core/src/
git mv src/types packages/core/src/
git mv src/config packages/core/src/
git mv tests packages/core/
git mv test.ts packages/core/

echo "Moving files for packages/mcp-transport..."
# Move each file from services into packages/mcp-transport/src/tools
for file in src/services/*; do
  if [ -f "$file" ]; then
    git mv "$file" "packages/mcp-transport/src/tools/$(basename "$file")"
  fi
done
# Remove empty src/services if git mv left it behind
rmdir src/services || true

git mv index.ts packages/mcp-transport/src/index.ts

echo "Done moving files!"
