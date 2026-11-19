#!/usr/bin/env sh
# Fetch Apache-2.0 upstream for independent local execution. Never clones into Git-tracked AntiScam code.
set -eu
REPO='https://github.com/mars-tw/anti-scam-helper.git'
REVISION='9b59bfaea4579e45c4ba862ae7db8d9327a8b3a7'
HERE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
DEST="${LINEJS_INSTALL_DIR:-$HERE/.runtime/anti-scam-helper}"
if [ -e "$DEST" ]; then
  printf '%s\n' 'Install destination exists; refusing to overwrite. Check the existing version manually.' >&2
  exit 1
fi
mkdir -p "$(dirname -- "$DEST")"
git clone --no-checkout "$REPO" "$DEST"
cd "$DEST"
git checkout --detach "$REVISION"
if [ "$(git rev-parse HEAD)" != "$REVISION" ]; then
  printf '%s\n' 'Source verification failed; aborting.' >&2
  exit 1
fi
npm ci --include=dev
npm run build
printf '\n%s\n' "Upstream pinned and built at $DEST" "Next configure config.yaml with api.enabled, api.moderation and scoped api.chats, start it, and log in with a dedicated TEST account."
