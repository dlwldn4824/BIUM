#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/dist/mac-arm64/BIUM.app"
DEST="/Applications/BIUM.app"
DESKTOP="$HOME/Desktop/BIUM.app"

if [[ ! -d "$SRC" ]]; then
  # electron-builder may output mac/ instead of mac-arm64/
  if [[ -d "$ROOT/dist/mac/BIUM.app" ]]; then
    SRC="$ROOT/dist/mac/BIUM.app"
  else
    echo "Build missing. Run: npm run dist" >&2
    ls -la "$ROOT/dist" 2>/dev/null || true
    exit 1
  fi
fi

pkill -f "BIUM.app/Contents/MacOS" 2>/dev/null || true
sleep 0.3

rm -rf "$DEST"
cp -R "$SRC" "$DEST"
xattr -cr "$DEST"

rm -rf "$DESKTOP"
cp -R "$SRC" "$DESKTOP"
xattr -cr "$DESKTOP"

echo "Installed: $DEST"
echo "Desktop:   $DESKTOP"
open "$DEST"
echo "Dock / Spotlight에서 BIUM, 또는 메뉴바 아이콘을 클릭하세요."
