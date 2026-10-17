#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

for tool in node npm code; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    printf 'Missing required command: %s\n' "$tool" >&2
    exit 1
  fi
done

npm ci
npm run build
npm run package

version="$(node -p "require('./package.json').version")"
code --install-extension "onlyhuman-vscode-${version}.vsix"
