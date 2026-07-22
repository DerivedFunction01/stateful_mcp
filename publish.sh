#!/usr/bin/env bash
set -e

echo "=== Running Changeset Version ==="
npx changeset version

echo "=== Resolving workspace: references ==="
# Read the version that changesets just set for @stateful-mcp/core
CORE_VERSION=$(node -e "console.log(require('./packages/core/package.json').version)")
echo "  @stateful-mcp/core resolved to: $CORE_VERSION"

# Replace "workspace:^" with the actual version in all package.json files
# We target only the packages directory so we don't touch the root
find packages -name "package.json" | while read -r pkg; do
  if grep -q '"workspace:\^"' "$pkg"; then
    echo "  Patching $pkg"
    sed -i "s|\"workspace:\\^\"|\"\^${CORE_VERSION}\"|g" "$pkg"
  fi
done

echo "=== Running Tests ==="
bun run test

echo "=== Building All Packages ==="
bun run build

echo "=== Checking NPM Authentication ==="
if ! npm whoami &>/dev/null; then
  echo "Error: You are not logged into npm. Run 'npm login' first."
  # Restore workspace: references before exiting
  find packages -name "package.json" | xargs sed -i "s|\"\\^${CORE_VERSION}\"|\"workspace:^\"|g"
  exit 1
fi

echo "=== Publishing via Changesets ==="
npx changeset publish

echo "=== Restoring workspace: references ==="
find packages -name "package.json" | xargs sed -i "s|\"\\^${CORE_VERSION}\"|\"workspace:^\"|g"

echo "=== Publish Complete! ==="