#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

for tool in node npm; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    printf 'Missing required command: %s\n' "$tool" >&2
    exit 1
  fi
done

# Keep the publish workflow self-contained and avoid a broken global npm cache.
export npm_config_cache="${npm_config_cache:-$PWD/.npm-cache}"
mkdir -p "$npm_config_cache"

package_name="$(node -p "require('./package.json').name")"
package_version="$(node -p "require('./package.json').version")"
private_flag="$(node -p "require('./package.json').private === true")"

if [ "$private_flag" = "true" ]; then
  printf 'Refusing to publish: package.json still has "private": true\n' >&2
  exit 1
fi

npm ci
npm test
npm run typecheck
npm run build:cli

if [ ! -f dist/cli.js ]; then
  printf 'Build did not produce dist/cli.js\n' >&2
  exit 1
fi

if ! head -n 1 dist/cli.js | grep -q '^#!'; then
  printf 'dist/cli.js is missing its node shebang\n' >&2
  exit 1
fi

npm pack --dry-run

if ! npm_user="$(npm whoami 2>/dev/null)"; then
  printf 'Not logged in to npm. Run npm login first.\n' >&2
  exit 1
fi
printf 'Publishing as %s\n' "$npm_user"

if npm view "$package_name" version >/dev/null 2>&1; then
  if npm view "${package_name}@${package_version}" version >/dev/null 2>&1; then
    printf '%s@%s is already published. Bump the version first.\n' "$package_name" "$package_version" >&2
    exit 1
  fi
  printf 'Package name %s already exists; continue only if you own it.\n' "$package_name"
fi

npm publish --dry-run

printf 'Ready to publish %s@%s to npm.\n' "$package_name" "$package_version"
read -r -p 'Publish now? [y/N] ' answer
case "$answer" in
  [yY]|[yY][eE][sS]) ;;
  *) printf 'Publish cancelled.\n'; exit 0 ;;
esac

if [[ "$package_name" == @*/* ]]; then
  npm publish --access public
else
  npm publish
fi

printf 'Published %s@%s\n' "$package_name" "$package_version"
