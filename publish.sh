#!/usr/bin/env bash

# Exit immediately if a command exits with a non-zero status
set -e

echo "=== Running Tests ==="
bun run test

echo "=== Building All Packages ==="
bun run build

echo "=== Checking NPM Authentication ==="
if ! npm whoami &>/dev/null; then
  echo "Error: You are not logged into npm. Run 'npm login' first."
  exit 1
fi

echo "=== Publishing Core to npm ==="
cd packages/core && npm publish --access public
cd ../..

echo "=== Publishing Transport to npm ==="
cd packages/mcp-transport && npm publish --access public
cd ../..

echo "=== Publishing CLI to npm ==="
cd packages/cli && npm publish --access public
cd ../..

echo "=== Publish Complete! ==="
