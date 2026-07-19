#!/usr/bin/env bash

# Exit immediately if a command exits with a non-zero status
set -e

echo "=== Running Tests ==="
bun test

echo "=== Building Package ==="
bun run build

echo "=== Checking NPM Authentication ==="
if ! npm whoami &>/dev/null; then
  echo "Error: You are not logged into npm. Run 'npm login' first."
  exit 1
fi

echo "=== Publishing to npm ==="
# If you have two-factor auth enabled, npm will automatically prompt you for the OTP
npm publish

echo "=== Publish Complete! ==="
